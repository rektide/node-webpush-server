var url = require('url');
var util = require('util');

var _ = require('lodash');
var boom = require('boom');
var uuid = require('node-uuid');
var joi = require('joi');

var models = require('./models');
var streams = require('./streams');

exports.postSub = {
    handler: function postSub(request, reply) {
        var self = this;
        var subId = uuid.v4();
        self.seal(subId, function afterSeal(err, subToken) {
            if (err) {
                reply(boom.wrap(err, 500, 'Error creating subscription'));
                return;
            }
            var response = reply();
            response.header('Cache-Control', 'max-age=864000, private');

            // "Subscription" resource.
            response.created('/s/' + encodeURIComponent(subId));
            response.header('Link', util.format([
                // "Push" resource.
                '</p/%s>; rel="urn:ietf:params:push:message"',
                // "Receipt subscribe" resource.
                '</receipts/%s>; rel="urn:ietf:params:push:receipt:subscribe"'
            ].join(','),
                encodeURIComponent(subToken),
                encodeURIComponent(subToken)
            ));
        });
    }
};

exports.delUpdate = {
    validate: {
        params: {
            updateToken: joi.string().required()
        }
    },
    handler: function ackUpdate(request, reply) {
        var self = this;
        self.unseal(request.params.updateToken, function afterUnseal(err, updateKey) {
            if (err) {
                reply(boom.wrap(err, 404, 'Nonexistent update'));
                return;
            }

            var updateKeyParts = updateKey.split(':');
            var subId = updateKeyParts[0];
            var updateId = updateKeyParts[1];

            var receiptId = updateKeyParts[2];
            if (!receiptId) {
                // Remove the acknowledged update from storage. TODO: Distinguish
                // between direct and stored updates to avoid the storage hit.
                self.storage.del([subId, 'updates', updateId].join(':'), function afterDel(err) {
                    if (err) {
                        // TODO: Retry.
                        reply(boom.wrap(err, 500, 'Error deleting update'));
                        return;
                    }
                    reply().code(200);
                });
                return;
            }

            var receipt = self.receipts.get(receiptId);
            var ack = new models.Ack(request.url.pathname, {
                'last-modified': Date.now()
            });

            // Delivery receipt requested and the application server is
            // offline. Drop the update from storage and store the receipt
            // for delivery when the server reconnects.
            if (!receipt) {
                var batch = self.storage.batch();
                batch.del([subId, 'updates', updateId].join(':'));
                batch.put([
                    subId,
                    'acks',
                    receiptId,
                    updateId
                ].join(':'), ack.stringify());
                batch.write(function afterWrite(err) {
                    if (err) {
                        // TODO: Retry.
                        reply(boom.wrap(err, 500, 'Error storing delivery receipt'));
                        return;
                    }
                    // TODO: Check if the app server has reconnected; flush the
                    // delivery receipt.
                    reply().code(200);
                });
                return;
            }

            // Delivery receipt requested and application server is offline.
            // Drop the update from storage and deliver the receipt.
            self.storage.del([subId, 'updates', updateId].join(':'), function afterDel(err) {
                if (err) {
                    // TODO: Retry.
                    reply(boom.wrap(err, 500, 'Error deleting update'));
                    return;
                }
                receipt.notify(ack, function afterNotify(err) {
                    if (err) {
                        // TODO: If the app server disconnects during delivery,
                        // store the ack.
                        reply(boom.wrap(err, 500, 'Error notifying app server'));
                        return;
                    }
                    reply().code(200);
                });
            });
        });
    }
};

exports.postUpdate = {
    validate: {
        params: {
            subToken: joi.string().required()
        }
    },
    payload: {
        output: 'data',
        parse: false
    },
    handler: function sendUpdate(request, reply) {
        var self = this;
        self.unseal(request.params.subToken, function afterUnseal(err, subId) {
            if (err) {
                afterReceipt(boom.wrap(err, 404, 'Nonexistent subscription'));
                return;
            }
            var receiptURI = request.headers['push-receipt'];
            if (!receiptURI) {
                afterReceipt(null, subId);
                return;
            }
            var receiptURL = url.parse(receiptURI, false);
            if (!receiptURL.path || !_.startsWith(receiptURL.path, '/r/')) {
                afterReceipt(boom.notFound('Invalid receipt URL'));
                return;
            }
            var receiptToken = receiptURL.path.slice('/r/'.length);
            self.unseal(receiptToken, function afterUnseal(err, receiptKey) {
                if (err) {
                    afterReceipt(boom.wrap(err, 404, 'Invalid receipt URL'));
                    return;
                }
                var receiptKeyParts = receiptKey.split(':');
                var receiptSubId = receiptKeyParts[0];
                var receiptId = receiptKeyParts[1];
                if (receiptSubId != subId) {
                    // The requested `Push-Receipt` URI belongs to a different
                    // subscription. TODO: Clarify correct behavior.
                    afterReceipt(boom.conflict('Mismatched receipt URL'));
                    return;
                }
                afterReceipt(null, subId, receiptId);
            });
        });
        function afterReceipt(err, subId, receiptId) {
            if (err) {
                reply(err);
                return;
            }
            var updateId = uuid.v4();
            var updateKeyParts = [subId, updateId];
            if (receiptId) {
                updateKeyParts.push(receiptId);
            }
            self.seal(updateKeyParts.join(':'), function afterSeal(err, updateToken) {
                if (err) {
                    reply(boom.wrap(err, 500, 'Error generating message token'));
                    return;
                }
                var update = new models.Update(path, {
                    'last-modified': Date.now(),
                    'content-type': request.headers['content-type'],
                    // `draft-nottingham-http-encryption-encoding-00` headers.
                    'encryption': request.headers.encryption,
                    'encryption-key': request.headers['encryption-key'],
                    'content-encoding': request.headers['content-encoding'],
                }, request.payload);
                var path = '/d/' + encodeURIComponent(updateToken);
                // Deliver the message to the client.
                self.push(subId, updateId, update, function afterPush(err) {
                  if (err) {
                    reply(boom.wrap(err, 500, 'Error delivering message'));
                    return;
                  }
                  reply().created(path);
                });
            });
        }
    }
};

exports.putUpdate = {
    validate: {
        params: {
            updateToken: joi.string().required()
        }
    },
    payload: {
        output: 'stream',
        parse: false
    },
    handler: function putUpdate(request, reply) {
        var self = this;
        self.unseal(request.params.updateToken, function afterUnseal(err, updateToken) {
            if (err) {
                reply(boom.wrap(err, 404, 'Nonexistent update'));
                return;
            }
            // TODO: Clarify if receipts should be updated.
            var updateKeyParts = updateToken.split(':');
            var subId = updateKeyParts[0];
            var updateId = updateKeyParts[1];
            var update = new models.Update(request.url.path, {
                'last-modified': Date.now(),
                'content-type': request.headers['content-type'],
                // `draft-nottingham-http-encryption-encoding-00` headers.
                'encryption': request.headers.encryption,
                'encryption-key': request.headers['encryption-key'],
                'content-encoding': request.headers['content-encoding'],
            });
            self.push(subId, updateId, update, function afterPush(err) {
                if (err) {
                    reply(boom.wrap(err, 500, 'Error delivering message'));
                    return;
                }
                reply().code(200);
            });
        });
    }
};

exports.getSub = {
    // `raw.req.socket` refers to the underlying HTTP/2 stream. Setting
    // `{ timeout: { socket: false } }` will throw an exception.
    validate: {
        params: {
            subId: joi.string().required()
        }
    },
    handler: function getSub(request, reply) {
        var self = this;
        if (request.raw.req.httpVersionMajor < 2) {
            reply(boom.create(505, 'Message delivery requires push promises.'));
            return;
        }
        var stream = request.raw.res;
        var subId = request.params.subId;
        self.flushUpdates(subId, stream, function afterFlush(err) {
            if (err) {
                reply(boom.wrap(err, 500, 'Error flushing updates'));
                return;
            }
            var wait = getWait(request.headers.prefer);
            if (wait === 0) {
                reply().code(204);
                return;
            }
            var monitor = new streams.Monitor(stream);
            if (wait > 0) {
                setTimeout(function endReply() {
                    monitor.writeClose(200);
                }, wait);
            }
            monitor.on('finish', function onFinish() {
                monitor.removeListener('finish', onFinish);
                reply.close({ end: false });
            });
            self.monitors.add(subId, monitor);
        });
    }
};

exports.delSub = {
    validate: {
        params: {
            subId: joi.string().required()
        }
    },
    handler: function delSub(request, reply) {
        var self = this;
        var subId = request.params.subId;
        self.drop(subId, function afterDrop(err) {
            if (err) {
                reply(boom.wrap(err, 500, 'Error deleting subscription'));
                return;
            }
            var monitor = self.monitors.get(subId);
            if (monitor) {
                self.monitors.delete(subId);
                monitor.writeClose(410);
                return;
            }
            reply(200);
        });
    }
};

exports.postReceiptSub = {
    validate: {
        params: {
            subToken: joi.string().required()
        }
    },
    handler: function postReceiptSub(request, reply) {
        var self = this;
        self.unseal(request.params.subToken, function afterUnseal(err, subId) {
            var receiptId = uuid.v4();
            var receiptKey = subId + ':' + receiptId;
            self.seal(receiptKey, function afterSeal(err, receiptToken) {
                // "Receipt" resource.
                reply().created('/r/' + encodeURIComponent(receiptToken));
            });
        });
    }
};

exports.getReceipts = {
    validate: {
        params: {
            receiptToken: joi.string().required()
        }
    },
    handler: function getReceipts(request, reply) {
        var self = this;
        if (request.raw.req.httpVersionMajor < 2) {
            reply(boom.create(505, 'Message receipts require push promises.'));
            return;
        }
        var stream = request.raw.res;
        self.unseal(request.params.receiptToken, function afterUnseal(err, receiptKey) {
            if (err) {
                reply(boom.wrap(err, 404, 'Nonexistent receipt token'));
                return;
            }
            var receiptKeyParts = receiptKey.split(':');
            var subId = receiptKeyParts[0];
            var receiptId = receiptKeyParts[1];
            self.flushAcks(subId, receiptId, stream, function afterFlush(err) {
                if (err) {
                    reply(boom.wrap(err, 500, 'Error flushing receipts'));
                    return;
                }
                var receipt = new streams.Receipt(stream);
                receipt.on('finish', function onFinish() {
                    receipt.removeListener('finish', onFinish);
                    reply.close({
                        end: false
                    });
                });
                self.receipts.add(receiptId, receipt);
            });
        });
    }
};

function getWait(prefer) {
    if (!prefer) {
        return -1;
    }
    // TODO: Extract the `wait` parameter.
    return -1;
}

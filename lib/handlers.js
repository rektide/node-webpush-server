var util = require('util');

var boom = require('boom');
var uuid = require('node-uuid');
var joi = require('joi');

exports.postRegister = {
    handler: function postRegister(request, reply) {
        var deviceId = uuid();

        request.server.app.manager.register(deviceId,
            function afterRegister(err, monitorURI, channelURI) {

            if (err) {
                reply(err);
                return;
            }

            var response = reply().code(201);
            response.header('Cache-Control', 'max-age=3600, private');

            response.header('Location', monitorURI);
            response.header('Link', util.format(
                '<%s>; rel="...:push:monitor", <%s>; rel="...:push:channel"',
                monitorURI, channelURI));
        });
    }
};

exports.postChannel = {
    validate: {
        params: {
            deviceId: joi.string().required()
        }
    },
    handler: function postChannel(request, reply) {
        var deviceId = request.params.deviceId;
        var channelId = uuid();

        request.server.app.manager.subscribe(deviceId, channelId,
            function afterSubscribe(err, updateURI) {

            if (err) {
                reply(err);
                return;
            }
            var response = reply().code(201);
            response.header('Location', updateURI);
        });
    }
};

exports.getChannel = {
    validate: {
        params: {
            deviceId: joi.string().required(),
            channelId: joi.string().required()
        }
    },
    handler: function getChannel(request, reply) {
        var deviceId = request.params.deviceId;
        var channelId = request.params.channelId;

        request.server.app.manager.last(deviceId, channelId,
            function afterLast(err, payload) {

            if (err) {
                reply(err);
                return;
            }
            reply(payload).code(200);
        });
    }
};

exports.delChannel = {
    handler: function delChannel(request, reply) {
        var deviceId = request.params.deviceId;
        var channelId = request.params.channelId;

        request.server.app.manager.unsubscribe(deviceId, channelId,
            function afterUnsubscribe(err) {

            if (err) {
                reply(err);
                return;
            }
            reply().code(200);
        });
    }
};

exports.getMonitor = {
    // `raw.req.socket` refers to the underlying HTTP/2 stream. Setting
    // `{ timeout: { socket: false } }` will throw an exception.
    validate: {
        params: {
            deviceId: joi.string().required()
        }
    },
    handler: function getMonitor(request, reply) {
        var deviceId = request.params.deviceId;

        var manager = request.server.app.manager;
        var stream = request.raw.res;

        manager.flush(deviceId, stream, function afterFlush(err) {
            if (err) {
                reply(err);
                return;
            }
            var wait = getWait(request.headers.prefer);
            if (wait === 0) {
                reply().code(204);
                return;
            }
            if (wait >= 0) {
                setTimeout(function endReply() {
                    reply.close();
                }, wait);
            }
            manager.monitor(deviceId, stream,
                function afterMonitor(err, monitor) {

                if (err) {
                    reply(err);
                    return;
                }
            });
        });
    }
};

exports.putUpdate = {
    validate: {
        params: {
            key: joi.string().required()
        }
    },
    payload: {
        output: 'stream',
        parse: false
    },
    handler: function putUpdate(request, reply) {
        var manager = request.server.app.manager;
        var key = request.params.key;
        manager.notify(key, request.payload, function afterNotify(err, ok) {
            if (err) {
                reply(err);
                return;
            }
            var response = reply();
            if (!ok) {
                response.code(202);
                return;
            }
            response.code(200);
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

var _ = require('lodash');
var iron = require('iron');
var level = require('level');

var models = require('./models');
var streams = require('./streams');

var Context = module.exports = function Context() {
    this.password = 'we7/1KKJDezJ17izLZWf4g==';
    this.monitors = new streams.PushStreams();
    this.receipts = new streams.PushStreams();
    this.storage = level('./db', {
        keyEncoding: 'utf8',
        valueEncoding: 'utf8'
    });
};

Context.prototype.seal = function seal(data, callback) {
    iron.seal(data, this.password, iron.defaults, callback);
};

Context.prototype.unseal = function unseal(token, callback) {
    iron.unseal(token, this.password, iron.defaults, callback);
};

Context.prototype.flushUpdates = function flushUpdates(subId, stream, callback) {
    var done = _.once(callback);
    var updateStream = this.storage.createReadStream({
        gte: [subId, 'updates', ' '].join(':'),
        lte: [subId, 'updates', '~'].join(':'),
        keys: true,
        values: true
    });
    function removeListeners() {
        updateStream.removeListener('data', onData);
        updateStream.removeListener('close', onClose);
        updateStream.removeListener('error', onError);
    }
    updateStream.on('error', onError);
    function onError(err) {
        removeListeners();
        done(err);
    }
    updateStream.on('close', onClose);
    function onClose() {
        removeListeners();
        done();
    }
    updateStream.on('data', onData);
    function onData(data) {
        var update = models.Update.parse(data.value);
        var push = stream.push({
            method: 'GET',
            path: update.path,
            headers: {}
        });
        push.writeHead(200, update.headers);
        push.end(update.payload);
    }
};

Context.prototype.flushAcks = function flushAcks(subId, receiptId, stream, callback) {
    var done = _.once(callback);
    var ackStream = this.storage.createReadStream({
        gte: [subId, 'acks', receiptId, ' '].join(':'),
        lte: [subId, 'acks', receiptId, '~'].join(':'),
        keys: true,
        values: true
    });
    function removeListeners() {
        ackStream.removeListener('data', onData);
        ackStream.removeListener('error', onError);
        ackStream.removeListener('close', onClose);
    }
    ackStream.on('data', onData);
    function onData(data) {
        var ack = models.Ack.parse(data.value);
        var push = stream.push({
            method: 'GET',
            path: ack.path,
            headers: {}
        });
        push.writeHead(410, ack.headers);
        push.end();
    }
    ackStream.on('error', onError);
    function onError(err) {
        removeListeners();
        done(err);
    }
    ackStream.on('close', onClose);
    function onClose() {
        removeListeners();
        done();
    }
};

Context.prototype.drop = function drop(subId, callback) {
    var done = _.once(callback);
    var batch = this.storage.batch();
    // Drop all messages and acks.
    var keyStream = this.storage.createReadStream({
        gte: [subId, ' '].join(':'),
        lte: [subId, '~'].join(':'),
        keys: true,
        values: false
    });
    function removeListeners() {
        keyStream.removeListener('data', onData);
        keyStream.removeListener('error', onError);
        keyStream.removeListener('close', onClose);
    }
    keyStream.on('data', onData);
    function onData(key) {
        batch.del(key);
    }
    keyStream.on('error', onError);
    function onError(err) {
        removeListeners();
        batch.clear();
        done(err);
    }
    keyStream.on('close', onClose);
    function onClose() {
        removeListeners();
        batch.write(done);
    }
};

Context.prototype.push = function push(subId, updateId, update, callback) {
    var monitor = this.monitors.get(subId);
    if (monitor) {
        // Client is connected; deliver the message.
        monitor.notify(update, function afterNotify(err) {
            if (err) {
                // Error delivering message. TODO: Store update if
                // the client disconnects.
                callback(err);
                return;
            }
            callback();
        });
        return;
    }
    // Client disconnected; save message in storage.
    this.storage.put([
        subId,
        'updates',
        updateId
    ].join(':'), update.stringify(), function afterPut(err) {
        if (err) {
            // TODO: Retry.
            callback(err);
            return;
        }
        // TODO: Check if client reconnected during storage; set a
        // flag to indicate pending updates.
        callback();
    });
};

var assert = require('assert');

var _ = require('lodash');
var iron = require('iron');
var LevelUP = require('levelup');

var models = require('./models');
var streams = require('./streams');

var Context = module.exports = function Context(settings) {
    assert(typeof settings.password == 'string', 'Invalid key password');
    this.password = settings.password;

    this.monitors = new streams.PushStreams();
    this.receipts = new streams.PushStreams();

    assert(typeof settings.storagePath == 'string', 'Invalid storage path');
    this.storage = new LevelUP(settings.storagePath, {
        db: settings.db,
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
    var updateStream = this.storage.createReadStream({
        gte: [subId, 'updates', ' '].join(':'),
        lte: [subId, 'updates', '~'].join(':'),
        keys: true,
        values: true
    });
    readDone(updateStream, function onData(data) {
        var update = models.Update.parse(data.value);
        var push = stream.push({
            method: 'GET',
            path: update.path,
            headers: {}
        });
        push.writeHead(200, update.headers);
        push.end(update.payload);
    }, callback);
};

Context.prototype.flushAcks = function flushAcks(subId, receiptId, stream, callback) {
    var batch = this.storage.batch();
    var ackStream = this.storage.createReadStream({
        gte: [subId, 'acks', receiptId, ' '].join(':'),
        lte: [subId, 'acks', receiptId, '~'].join(':'),
        keys: true,
        values: true
    });
    readDone(ackStream, function onData(data) {
        batch.del(data.key);
        var ack = models.Ack.parse(data.value);
        var push = stream.push({
            method: 'GET',
            path: ack.path,
            headers: {}
        });
        push.writeHead(410, ack.headers);
        push.end();
    }, function onClose(err) {
        if (err) {
            batch.clear();
            callback(err);
            return;
        }
        batch.write(callback);
    });
};

Context.prototype.drop = function drop(subId, callback) {
    var batch = this.storage.batch();
    // Drop all messages and acks.
    var keyStream = this.storage.createReadStream({
        gte: [subId, ' '].join(':'),
        lte: [subId, '~'].join(':'),
        keys: true,
        values: false
    });
    readDone(keyStream, function onData(key) {
        batch.del(key);
    }, function onClose(err) {
        if (err) {
            batch.clear();
            callback(err);
            return;
        }
        batch.write(callback);
    });
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

function readDone(stream, onData, callback) {
    var done = _.once(callback);
    function removeListeners() {
        stream.removeListener('data', onData);
        stream.removeListener('close', onClose);
        stream.removeListener('error', onError);
    }
    stream.on('data', onData);
    stream.on('close', onClose);
    function onClose() {
        removeListeners();
        done();
    }
    stream.on('error', onError);
    function onError(err) {
        removeListeners();
        done(err);
    }
}

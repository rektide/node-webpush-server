var assert = require('assert');

var _ = require('lodash');
var iron = require('iron');
var LevelUP = require('levelup');

var helpers = require('./helpers');
var models = require('./models');
var streams = require('./streams');

var Context = module.exports = function Context(settings) {
    assert(typeof settings.password == 'string', 'Invalid key password');
    assert(typeof settings.storagePath == 'string', 'Invalid storage path');
    this.settings = settings;

    this.monitors = new streams.PushStreams();
    this.receipts = new streams.PushStreams();

    this.storage = new LevelUP(this.settings.storagePath, {
        db: this.settings.db,
        keyEncoding: 'utf8',
        valueEncoding: 'utf8'
    });
};

Context.prototype.settings = null;
Context.prototype.monitors = null;
Context.prototype.receipts = null;
Context.prototype.storage = null;

Context.prototype.start = function start(next) {
    next();
};

Context.prototype.stop = function stop(next) {
    next();
};

Context.prototype.seal = function seal(data, callback) {
    iron.seal(data, this.settings.password, iron.defaults, callback);
};

Context.prototype.unseal = function unseal(token, callback) {
    iron.unseal(token, this.settings.password, iron.defaults, callback);
};

Context.prototype.subscribe = function subscribe(payload, next) {
    next();
};

Context.prototype.flushUpdates = function flushUpdates(subId, stream, callback) {
    var updateStream = this.storage.createReadStream({
        gte: [subId, 'updates', ' '].join(':'),
        lte: [subId, 'updates', '~'].join(':'),
        keys: true,
        values: true
    });
    helpers.readDone(updateStream, function onData(data) {
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
    helpers.readDone(ackStream, function onData(data) {
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
    helpers.readDone(keyStream, function onData(key) {
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

Context.prototype.push = function push(subId, subParams, updateId, update, callback) {
    var self = this;
    var monitor = this.monitors.get(subId);
    if (!monitor) {
        // Client disconnected; save message in storage.
        store();
        return;
    }
    // Client is connected; deliver the message.
    monitor.notify(update, function afterNotify(err) {
        if (err) {
            // Store the message if delivery fails.
            store();
            return;
        }
        // Delivery succeeded.
        callback();
    });
    function store() {
        self.storage.put([
            subId,
            'updates',
            updateId
        ].join(':'), update.stringify(), function afterPut(err) {
            if (err) {
                // TODO: Retry.
                callback(err);
                return;
            }
            var monitor = self.monitors.get(subId);
            if (monitor) {
                // If the client reconnected during storage, notify it to check storage.
                monitor.emit('refresh');
            }
            callback();
        });
    }
};

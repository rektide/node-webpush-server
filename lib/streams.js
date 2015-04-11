var events = require('events');
var util = require('util');

var _ = require('lodash');

var PushStreams = exports.PushStreams = function PushStreams() {
    this.pushStreams = {};
};

PushStreams.prototype.pushStreams = null;

PushStreams.prototype.add = function add(id, pushStream) {
    var self = this;
    var prevStream = this.pushStreams[id];
    if (prevStream) {
        // Close the previous stream.
        delete this.pushStreams[id];
        prevStream.close();
    }
    this.pushStreams[id] = pushStream;
    pushStream.on('finish', function onFinish() {
        pushStream.removeListener('finish', onFinish);
        self.deleteIfExists(id, pushStream);
    });
};

PushStreams.prototype.delete = function del(id) {
    delete this.pushStreams[id];
};

PushStreams.prototype.deleteIfExists = function deleteIfExists(id, pushStream) {
    if (this.pushStreams[id] == pushStream) {
        delete this.pushStreams[id];
        return true;
    }
    return false;
};

PushStreams.prototype.get = function get(id) {
    return this.pushStreams[id];
};

var PushStream = exports.PushStream = function PushStream(stream) {
    events.EventEmitter.call(this);
    this._onFinishBound = _.bindKey(this, '_onFinish');
    stream.on('error', this._onFinishBound);
    stream.on('finish', this._onFinishBound);
    this.stream = stream;
};

util.inherits(PushStream, events.EventEmitter);

PushStream.prototype.stream = null;

PushStream.prototype._onFinish = function _onFinish() {
    this.stream.removeListener('error', this._onFinishBound);
    this.stream.removeListener('finish', this._onFinishBound);
    this.emit('finish');
};

PushStream.prototype.writeClose = function writeClose() {
    this.stream.writeHead.apply(this, arguments);
    this.stream.end();
};

PushStream.prototype.close = function close() {
    this.stream.close();
};

var Receipt = exports.Receipt = function Receipt() {
    PushStream.apply(this, arguments);
};

util.inherits(Receipt, PushStream);

Receipt.prototype.notify = function notify(ack, callback) {
    var push = this.stream.push({
        method: 'GET',
        path: ack.path,
        headers: {}
    });
    push.writeHead(410, ack.headers);
    push.end();
};

var Monitor = exports.Monitor = function Monitor() {
    PushStream.apply(this, arguments);
};

util.inherits(Monitor, PushStream);

Monitor.prototype.notify = function notify(update, callback) {
    var push = this.stream.push({
        method: 'GET',
        path: update.path,
        headers: {}
    });
    push.writeHead(200, update.headers);
    push.end(update.payload);
};

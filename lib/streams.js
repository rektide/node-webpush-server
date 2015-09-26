var events = require('events');
var util = require('util');

var _ = require('lodash');

var PushStreams = exports.PushStreams = function PushStreams() {
    this.pushStreams = {};
};

util.inherits(PushStreams, events.EventEmitter);

PushStreams.prototype.pushStreams = null;

PushStreams.prototype.add = function add(id, pushStream) {
    var self = this;
    var prevStream = this.pushStreams[id];
    if (prevStream) {
        // Close the previous stream.
        delete this.pushStreams[id];
        prevStream.writeClose(200);
    }
    this.pushStreams[id] = pushStream;
    pushStream.on('finish', function onFinish() {
        pushStream.removeListener('finish', onFinish);
        self.deleteIfExists(id, pushStream);
    });
    this.emit('data', pushStream, id);
};

PushStreams.prototype.delete = function del(id) {
    if (this.pushStreams[id]) {
        delete this.pushStreams[id];
        this.emit('data', null, id);
    }
};

PushStreams.prototype.deleteIfExists = function deleteIfExists(id, pushStream) {
    if (this.pushStreams[id] == pushStream) {
        delete this.pushStreams[id];
        this.emit('data', null, id);
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
    this.stream.writeHead.apply(this.stream, arguments);
    this.stream.end();
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
    writeDone(push, callback);
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
    writeDone(push, callback);
    push.writeHead(200, update.headers);
    push.end(update.payload);
};

function writeDone(stream, callback) {
    var done = _.once(callback);
    function removeListeners() {
        stream.removeListener('error', onError);
        stream.removeListener('finish', onFinish);
    }
    stream.on('error', onError);
    function onError(err) {
        removeListeners();
        done(err);
    }
    stream.on('finish', onFinish);
    function onFinish(err) {
        removeListeners();
        done();
    }
}

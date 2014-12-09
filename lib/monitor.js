var events = require('events');
var util = require('util');

var PatientStream = require('patient-stream');

var Monitor = module.exports = function Monitor() {
    events.EventEmitter.call(this);
    this.streams = [];
};

util.inherits(Monitor, events.EventEmitter);

Monitor.prototype.streams = null;

Monitor.prototype.removeStream = function removeStream(stream) {
    var isRemoved = false;
    for (var length = this.streams.length; length--;) {
        if (this.streams[length] === stream) {
            isRemoved = true;
            this.streams.splice(length, 1);
        }
    }
    if (!this.streams.length) {
        this.emit('close');
    }
    return isRemoved;
};

Monitor.prototype.addStream = function addStream(stream) {
    var self = this;
    stream.on('error', onFinish);
    stream.on('finish', onFinish);
    function onFinish() {
        stream.removeListener('error', onFinish);
        stream.removeListener('finish', onFinish);
        self.removeStream(stream);
    }
    this.streams.push(stream);
};

Monitor.prototype.notify = function notify(deviceId, channelId, payload, callback) {
    var tee = new PatientStream(this.streams.length);
    tee.on('error', onError);
    function onError(err) {
        tee.removeListener('error', onError);
        tee.removeListener('end', onEnd);
        callback(err);
    }
    tee.on('end', onEnd);
    function onEnd() {
        tee.removeListener('error', onError);
        tee.removeListener('end', onEnd);
        callback(null, true);
    }
    payload.pause();
    payload.pipe(tee);
    for (var length = this.streams.length; length--;) {
        var stream = this.streams[length];
        var push = stream.push({
            method: 'GET',
            path: util.format('/devices/%s/channels/%s',
                encodeURIComponent(deviceId), encodeURIComponent(channelId)),
            headers: {}
        });
        push.writeHead(200, {
            // TODO: Use `mimesniff` to detect the content type.
            'Content-Type': 'application/octet-stream'
        });
        tee.pipe(push);
    }
};

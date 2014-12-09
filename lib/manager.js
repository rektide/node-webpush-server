var util = require('util');

var boom = require('boom');
var iron = require('iron');

var Monitor = require('./monitor');

var Manager = module.exports = function Manager() {
    this.password = 'we7/1KKJDezJ17izLZWf4g==';
    this.registrations = {};
    this.monitors = {};
};

Manager.prototype.register = function register(deviceId, callback) {
    var channels = this.registrations[deviceId];
    if (channels) {
        callback(boom.conflict(
            util.format('Device %s already registered', deviceId)));
        return;
    }
    this.registrations[deviceId] = {};
    var monitorURI = util.format('/devices/%s',
        encodeURIComponent(deviceId));

    var channelURI = util.format('/devices/%s/channels',
        encodeURIComponent(deviceId));

    callback(null, monitorURI, channelURI);
};

Manager.prototype.subscribe = function subscribe(deviceId, channelId,
    callback) {

    var channels = this.registrations[deviceId];
    if (!channels) {
        callback(boom.notFound(
            util.format('Device %s not registered', deviceId)));
        return;
    }
    var info = {
        device: deviceId,
        channel: channelId
    };
    iron.seal(info, this.password, iron.defaults,
        function afterSeal(err, key) {

        if (err) {
            callback(boom.internal(util.format(
                'Error generating key for channel %s', channelId), err));
            return;
        }
        var updateURI = '/updates/' + encodeURIComponent(key);
        channels[channelId] = updateURI;
        callback(null, updateURI);
    });
};

Manager.prototype.unsubscribe = function unsubscribe(deviceId, channelId,
    callback) {

    var channels = this.registrations[deviceId];
    if (!channels) {
        callback(boom.notFound(
            util.format('Device %s not registered', deviceId)));
        return;
    }
    if (!channels[channelId]) {
        callback(boom.notFound(
            util.format('Device %s not subscribed to channel %s',
            deviceId, channelId)));
        return;
    }
    delete channels[channelId];
    callback(null);
};

Manager.prototype.last = function last(deviceId, channelId, callback) {
    // TODO: Return the most recent message sent on `channelId`.
    callback(null, null);
};

Manager.prototype.flush = function flush(deviceId, stream, callback) {
    // TODO: Write push promise frames for stored updates.
    callback(null);
};

Manager.prototype.monitor = function monitor(deviceId, stream, callback) {
    var self = this;
    var m = this.monitors[deviceId];
    if (!m) {
        m = new Monitor();
        m.on('close', function onClose() {
            m.removeListener('close', onClose);
            delete self.monitors[deviceId];
        });
        this.monitors[deviceId] = m;
    }
    m.addStream(stream);
    callback(null, m);
};

Manager.prototype.notify = function notify(key, payload, callback) {
    var self = this;

    iron.unseal(key, this.password, iron.defaults,
        function afterUnseal(err, info) {

        if (err) {
            callback(boom.internal(
                util.format('Invalid channel key: %s', key), err));
            return;
        }
        var deviceId = info.device;
        var monitor = self.monitors[deviceId];
        if (!monitor) {
            // TODO: Store payloads; return `(null, false)`.
            callback(boom.notFound(
                util.format('Device %s not connected', deviceId)));
            return;
        }
        monitor.notify(deviceId, info.channel, payload, callback);
    });
};

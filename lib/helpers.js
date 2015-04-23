var _ = require('lodash');
var wreck = require('wreck');

// Wraps `process.nextTick` with variadic arguments support. Supported natively
// in io.js >= 1.8.1.
exports.nextTick = function nextTick(func) {
    var params;
    if (arguments.length > 1) {
        params = Array(arguments.length - 1);
        for (var length = arguments.length; length--;) {
            params[length - 1] = arguments[length];
        }
    }
    process.nextTick(function afterTick() {
        if (params) {
            func.apply(null, params);
        } else {
            func();
        }
    });
};

exports.readDone = function readDone(stream, onData, callback) {
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
};

exports.writeDone = function writeDone(stream, callback) {
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
};

exports.waitForEvent = function waitForEvent(emitter, event, delay, callback) {
    emitter.on(event, onEvent);
    var timerId = setTimeout(function afterTimeout() {
        emitter.removeListener(event, onEvent);
        callback(new Error('Timed out waiting for event'));
    }, delay);
    function onEvent() {
        emitter.removeListener(event, onEvent);
        clearTimeout(timerId);
        callback.apply(null, arguments);
    }
};

exports.ignoreBody = function ignoreBody(stream, callback) {
    var done = _.once(callback);
    stream.on('error', onError);
    function onError(err) {
        stream.removeListener('error', onError);
        stream.removeListener('end', onEnd);
        done(err);
    }
    stream.on('end', onEnd);
    function onEnd() {
        stream.removeListener('error', onError);
        stream.removeListener('end', onEnd);
        done();
    }
    stream.resume();
};

exports.requestWithoutBody = function requestWithoutBody(method, requestURL, options, callback) {
    wreck.request(method, requestURL, options, function afterRequest(err, response) {
        if (err) {
            callback(err);
            return;
        }
        exports.ignoreBody(response, callback);
    });
};

exports.isSuccessStatus = function isSuccessStatus(statusCode) {
    return statusCode >= 200 && statusCode < 300;
};

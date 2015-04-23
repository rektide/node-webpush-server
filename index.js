var assert = require('assert');
var fs = require('fs');

var minimist = require('minimist');

var bridges = require('./lib/bridges');
var Context = require('./lib/context');
var createServer = require('./lib');

function serverWithFlags(options) {
    assert(options && typeof options == 'object', 'Missing server options');

    var port = +options.port;
    assert(isFinite(port), 'The server port must be a number');

    var listenerOpts = {};
    var hasKeys = !!(options.key && options.cert) ^ options.pfx;
    assert(hasKeys ^ options.h2c, 'Missing or invalid server keys');
    if (options.pfx) {
        listenerOpts.pfx = fs.readFileSync(options.pfx);
    } else if (options.key) {
        listenerOpts.key = fs.readFileSync(options.key);
        listenerOpts.cert = fs.readFileSync(options.cert);
    } else {
        listenerOpts.plain = true;
    }

    var contextOpts = {
        password: 'we7/1KKJDezJ17izLZWf4g==',
        storagePath: './db',
        db: require('leveldown')
    };
    var context;
    if (options.udp === true) {
        contextOpts.baseURL = 'http://localhost:8000';
        context = new bridges.UDPBridge(contextOpts);
    } else if (options.gcm === true) {
        contextOpts.baseURL = 'https://android.googleapis.com';
        context = new bridges.GCMBridge(contextOpts);
    } else {
        context = new Context(contextOpts);
    }
    return createServer(null, port, listenerOpts, context);
}

function main() {
    var flags = minimist(process.argv.slice(2));
    var server = serverWithFlags(flags);

    var context = server.realm.settings.bind;
    context.start(function afterContextStart(err) {
        assert.ifError(err);
        server.start(function afterServerStart(err) {
            assert.ifError(err);
            console.log('Listening on %s...', server.info.uri);
        });
    });
}

main();

var assert = require('assert');
var fs = require('fs');

var minimist = require('minimist');

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

    return createServer(null, port, listenerOpts, new Context({
        password: 'we7/1KKJDezJ17izLZWf4g==',
        storagePath: './db',
        db: require('leveldown')
    }));
}

function main() {
    var flags = minimist(process.argv.slice(2));
    var server = serverWithFlags(flags);

    server.start(function afterStart(err) {
        if (err) {
            throw err;
        }
        console.log('Listening on %s...', server.info.uri);
    });
}

main();

var assert = require('assert');
var http = require('http');
var https = require('https');
var url = require('url');
var util = require('util');

var boom = require('boom');
var joi = require('joi');
var qs = require('qs');
var wreck = require('wreck');

var Context = require('./context');
var helpers = require('./helpers');

exports.udpParamsSchema = {
    // Mobile country code.
    mcc: joi.string().required(),

    // Mobile network code.
    mnc: joi.string().required(),

    // Network ID. Carriers shard users across multiple networks; each network
    // runs a DNS server that responds to `3gppnetwork.org` queries.
    netid: joi.string().required(),

    // The device IP on the carrier's network, recorded by the GGSN.
    ip: joi.string().required(),

    // The device UDP server port.
    port: joi.number().greater(0).less(65536).integer().required()
};

exports.gcmParamsSchema = {
    // Registration ID.
    regid: joi.string().required(),

    // Collapse key.
    collapse_key: joi.string(),

    // Message time-to-live.
    ttl: joi.number()
};

var UDPBridge = exports.UDPBridge = function UDPBridge() {
    Context.apply(this, arguments);

    assert(typeof this.settings.baseURL == 'string', 'Missing bridge URL');
    this.baseURI = url.parse(this.settings.baseURL, false, true);

    this.devices = {};

    var agentOpts = {
        keepAlive: true,
        maxSockets: this.maxSockets
    };
    if (this.baseURI.protocol == 'https:') {
        assert(Buffer.isBuffer(this.settings.udpKey), 'Missing bridge private key');
        agentOpts.key = this.settings.udpKey;

        assert(Buffer.isBuffer(this.settings.udpCert), 'Missing bridge certificate');
        agentOpts.ca = this.settings.udpCert;

        this.agent = new https.Agent(agentOpts);
    } else {
        this.agent = new http.Agent(agentOpts);
    }
};

util.inherits(UDPBridge, Context);

UDPBridge.prototype.baseURI = null;
UDPBridge.prototype.devices = null;
UDPBridge.prototype.agent = null;
UDPBridge.prototype.reconnectTimeout = 10000;
UDPBridge.prototype.refreshInterval = 5000;
UDPBridge.prototype.maxSockets = 15;

UDPBridge.prototype.subscribe = function subscribe(payload, callback) {
    joi.validate(payload, exports.udpParamsSchema, callback);
};

UDPBridge.prototype.push = function push(subId, subParams, updateId, update, callback) {
    var self = this;
    self.ping(subId, subParams, function afterPing(err) {
        Context.prototype.push.call(self, subId, subParams, updateId, update, callback);
    });
};

UDPBridge.prototype.ping = function ping(subId, subParams, callback) {
    var self = this;
    if (!subParams.mcc) {
        Context.prototype.push.apply(this, arguments);
        return;
    }
    var netCode = subParams.mcc + '-' + subParams.mnc + '.' + subParams.netid;
    var range = this.devices[netCode];
    if (!range) {
        helpers.nextTick(callback);
        return;
    }
    var notifyURL = this.baseURI.resolve('/wakeup/v1');
    helpers.requestWithoutBody('POST', notifyURL, {
        headers: {
            'x-client-cert-verified': 'SUCCESS'
        },
        payload: qs.stringify(subParams),
        agent: this.agent
    }, function afterRequest(err, response) {
        if (err) {
            callback(err);
            return;
        }
        if (!helpers.isSuccessStatus(response.statusCode)) {
            callback(boom.create(
                response.statusCode,
                'Unexpected ping status code'
            ));
            return;
        }
        var monitor = self.monitors.get(subId);
        if (monitor) {
            callback(null, monitor);
            return;
        }
        // Wait for the device to reconnect.
        helpers.waitForEvent(
            self.monitors,
            'add:' + subId,
            self.reconnectTimeout,
            callback
        );
    });
};

UDPBridge.prototype.refresh = function refresh(callback) {
    var self = this;
    var infoURL = this.baseURI.resolve('/netinfo/v1');
    wreck.get(infoURL, {
        headers: {
            'x-client-cert-verified': 'SUCCESS'
        },
        agent: this.agent,
        json: 'force',
        maxBytes: 1024 * 8
    }, function afterGet(err, response, nodes) {
        if (err) {
            callback(err);
            return;
        }
        // Update the list of available local nodes.
        for (var length = nodes.nets.length; length--;) {
            var node = nodes.nets[length];
            var netCode = node.mccmnc + '.' + node.netid;
            if (node.offline) {
                // Avoid routing to offline nodes.
                delete self.devices[netCode];
            } else {
                self.devices[netCode] = node.range;
            }
        }
        callback();
    });
};

function refreshBridge(bridge, callback) {
    bridge.refresh(callback);
}

UDPBridge.prototype.start = function start(next) {
    var self = this;
    if (this.pollId) {
        clearTimeout(this.pollId);
    }
    // Poll for available networks.
    helpers.nextTick(refreshBridge, self, function afterRefresh(err) {
        self.pollId = setTimeout(
            refreshBridge,
            self.refreshInterval,
            self,
            afterRefresh
        );
    });
    Context.prototype.start.call(this, next);
};

UDPBridge.prototype.stop = function stop(next) {
    clearTimeout(this.pollId);
    Context.prototype.stop.call(this, next);
};

var GCMBridge = exports.GCMBridge = function GCMBridge(settings) {
    Context.apply(this, arguments);

    assert(typeof this.settings.baseURL == 'string', 'Missing bridge URL');
    this.baseURI = url.parse(this.settings.baseURL, false, true);

    assert(typeof this.settings.key == 'string', 'Missing API key');

    this.agent = new https.Agent({
        keepAlive: true,
        maxSockets: this.maxSockets
    });
};

util.inherits(GCMBridge, Context);

GCMBridge.prototype.baseURI = null;
GCMBridge.prototype.isDryRun = false;
GCMBridge.prototype.agent = null;
GCMBridge.prototype.maxSockets = 15;

GCMBridge.prototype.subscribe = function subscribe(payload, callback) {
    joi.validate(payload, exports.gcmParamsSchema, callback);
};

GCMBridge.prototype.push = function push(subId, subParams, updateId, update, callback) {
    var self = this;
    if (!subParams.regid) {
        Context.prototype.push.apply(this, arguments);
        return;
    }
    // Try delivering via the bridge.
    var data;
    var dataLength = 0;
    if (update.payload && update.payload.length > 0) {
        data = update.payload.toString('utf8');
        dataLength = Buffer.byteLength(data);
    }
    helpers.requestWithoutBody('POST', this.baseURI.resolve('/gcm/send'), {
        headers: {
            authorization: 'key=' + this.settings.key,
            'content-length': dataLength,
            'content-type': 'application/json'
        },
        body: JSON.stringify({
            registration_ids: [subParams.regid],
            collapse_key: subParams.collapse_key,
            time_to_live: subParams.ttl,
            dry_run: this.settings.isDryRun === true,
            data: {
                msg: data
            }
        }),
        agent: this.agent
    }, function afterRequest(err, response) {
        if (err) {
            // TODO: Retry.
            Context.prototype.push.call(self, subId, subParams, updateId, update, callback);
            return;
        }
        if (helpers.isSuccessStatus(response.statusCode)) {
            callback();
            return;
        }
        // Fall back to local delivery or storage.
        Context.prototype.push.call(self, subId, subParams, updateId, update, callback);
    });
};

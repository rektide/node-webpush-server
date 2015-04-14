var _ = require('lodash');

exports.getWait = function getWait(prefer) {
    if (!prefer) {
        return -1;
    }
    var prefs = prefer.split(',');
    for (var i = 0; i < prefs.length; i++) {
        var paramIndex = prefs[i].indexOf(';');
        var pref = paramIndex > -1 ? prefs[i].slice(0, paramIndex) : prefs[i];
        var parts = pref.split('=', 2);
        if (parts.length == 2 && _.trim(parts[0]) == 'wait') {
            var wait = +parts[1];
            if (isFinite(wait)) {
                return wait;
            }
        }
    }
    return -1;
};

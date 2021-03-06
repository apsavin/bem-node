/**
 * Request rest api
 */
(function () {
    var request = require('request'), //@see https://github.com/mikeal/request/
        url = require('url'),
        dns = require('dns'),
        apiResolveCache = {},
        querystring = require('querystring'),
        zlib = require('zlib');

    require('http').globalAgent.maxSockets = 20;

    BEM.decl('i-api-request', null, {

        /**
         * @abstruct
         */
        _apiHost: undefined,

        /**
         * Default api timeout time in ms
         */
        TIMEOUT: 5000,

        /**
         * Define request headers
         */
        _getRequestHeaders: function (hostname) {
            return {
                'Accept': 'application/json',
                'Content-type': 'application/json',
                'Accept-Encoding': 'gzip, deflate',
                'host': hostname, //bug with Host when capitalized in https://github.com/mikeal/request/
                'Connection': 'keep-alve'
            };
        },

        /**
         * Resolve ip address
         * @param {String} host
         * @return {Vow.promise}
         */
        _dnsResolve: function (parsedUrl) {
            var promises = ['resolve6', 'resolve4'].map(function (method) {
                var promise = Vow.promise();
                dns[method](parsedUrl.hostname, BEM.blocks['i-state'].bind(function (err, ips) {
                    if (err) {
                        return promise.reject(err);
                    }

                    var ip = ips[0],
                        testUrl = url.format({
                            protocol: parsedUrl.protocol,
                            hostname: ip,
                            port: parsedUrl.port
                        });

                    request(testUrl, function (err) {
                        if (err) {
                            return promise.reject(err);
                        }
                        promise.fulfill(ip);
                    });

                }));
                return promise;
            });

            return Vow.any(promises);
        },

        /**
         * Cachable resolve hostname in DNS.
         * Use cached ip if possible.
         * Maintain cache.
         * @param {Object} parsedUrl
         * @returns {Vow}
         */
        _resolveHostname: function (parsedUrl) {
            var host = parsedUrl.hostname;
            if (apiResolveCache[host]) {
                return Vow.fulfill(apiResolveCache[host]);
            }

            return this._dnsResolve(parsedUrl).then(function (ip) {
                apiResolveCache[host] = ip;
                return apiResolveCache[host];
            });
        },

        /**
         * Security check for resource
         *
         * @param {String} resource
         * @return {Boolean}
         */
        _checkResource: function (resource) {
            return resource.indexOf('?') === -1;
        },

        /**
         *  Http request rest api
         *
         *  @param {String} method Http method
         *  @param {String} resource resource or full url.
         *  if resource is used url is build as concatenation
         *  of this._apiHost and resource
         *  @param {Object} data
         *  @param {Object} [data.params] Get params
         *  @param {Object} [data.output=object] Output format
         *  @return {Vow.Promise}
         */
        _request: function (method, resource, data) {
            var requestUrl,
                parsedUrl;

            if (resource.indexOf('http') !== 0) {
                if (!this._checkResource(resource)) {
                    return Vow.reject(new this._HttpError(400));
                }
                if (!this._apiHost) {
                    return Vow.reject(new Error('_apiHost is not specified; Define ._apiHost on your level first'));
                }
                requestUrl = this._apiHost.replace(/\/+$/, '') + '/' + resource;
            } else {
                if (!this._checkResource(resource.replace(/https?\/\//, ''))) {
                    return Vow.reject(new this._HttpError(400));
                }
                requestUrl = resource;
            }
            parsedUrl = url.parse(requestUrl);

            return this._resolveHostname(parsedUrl).then(function (hostIp) {
                return this._requestApi(method, parsedUrl, hostIp, data);
            }.bind(this));
        },

        /**
         * Decode gziped body
         */
        _decodeBody: function (res, body, callback) {
            if (body && res.headers['content-encoding'] === 'gzip') {
                zlib.gunzip(body, function (err, decodedBody) {
                    if (err) {
                        callback(err);
                    } else {
                        callback(null, decodedBody.toString());
                    }
                });
            } else if (body) {
                callback(null, body.toString());
            } else {
                callback(null, '');
            }
        },

        /**
         * Build request url from url, data to query, and host's ip address
         * @param {Object} parsedUrl Standart nodejs's object that represents url.
         * @param {Object} [query] data to send in url.
         * @param {String} [hostIp] Ip address of host, to send request to.
         * @returns {String}
         */
        _getUri: function (parsedUrl, query, hostIp) {
            var stringQuery = query && querystring.stringify(query),
                stringifiedUrl;
            parsedUrl = jQuery.extend({}, parsedUrl);
            parsedUrl.hostname = hostIp || parsedUrl.hostname;
            parsedUrl.host = parsedUrl.href = undefined;
            stringifiedUrl = url.format(parsedUrl);
            return stringifiedUrl + (stringQuery ? ((stringifiedUrl.indexOf('?') !== -1 ? '&' : '?') + stringQuery) : '');
        },

        /**
         * Build object with http request options
         * @param {String} method HTTP protocol method.
         * @param {Object} parsedUrl Standart nodejs's object that represents url.
         * @param {String} hostIp Ip address of host, to send request to.
         * @param {Object} data Data to send in url or in body of request
         * @returns {Object}
         */
        _buildRequestOptions: function (method, parsedUrl, hostIp, data) {
            return {
                uri: this._getUri(parsedUrl, data && data.params, hostIp),
                method: method,
                encoding: null,
                forever: true,
                headers: this._getRequestHeaders(parsedUrl.hostname),
                timeout: this.TIMEOUT
            };
        },

        /**
         * Request rest api with predefined api params
         * @param {String} method HTTP protocol method.
         * @param {Object} parsedUrl Standart nodejs's object that represents url.
         * @param {String} hostIp Ip address of host, to send request to.
         * @param {Object} data Data to send in url or in body of request
         * @returns {Vow}
         */
        _requestApi: function (method, parsedUrl, hostIp, data) {
            var promise = Vow.promise(),
                _this = this,
                requestOptions = this._buildRequestOptions(method, parsedUrl, hostIp, data),
                originalUrl = this._getUri(parsedUrl, data && data.params);

            if (data && data.body) {
                requestOptions.body = this._normalizeBody(data.body);
            }

            request(requestOptions, function (err, res, encodedBody) {
                if (err) {
                    if (err.code === 'ETIMEDOUT') {
                        console.error(['ETIMEDOUT', method, originalUrl].join(' '));
                        promise.reject(new _this._HttpError(500, ['ETIMEDOUT', method, originalUrl].join(' ')));
                    } else {
                        promise.reject(err);
                    }
                } else {
                    _this._decodeBody(res, encodedBody, function (err, body) {
                        if (err) {
                            promise.reject(err);
                        } else {
                            if (res.statusCode !== 200) {
                                console.error([res.statusCode, method, originalUrl].join(' '));
                                promise.reject(new _this._HttpError(
                                    res.statusCode
                                ));
                            } else if (data && data.requestSource === 'ajax') {
                                promise.fulfill(body);
                            } else {
                                _this._parse(promise, body);
                            }
                        }
                    });
                }
            });

            return promise;
        }
    });
}());

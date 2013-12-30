var cluster = require('cluster');
BEM.decl({name: 'i-www-server', baseBlock: 'i-server'}, null, {

    /**
     * Starts HTTP server and loads priv.js
     *
     * @param {Object} [params]
     * @conf {Number|String} initialSocket
     * @conf {Boolean} restartWorker
     * @conf {Function} done
     */
    init: function (inParams) {
        var params = inParams || {},
            socket = params.initialSocket || BEM.blocks['i-command'].get('socket'),
            number;

        if (!socket) {
            console.error('Socket not specified');
            return 1;
        }
        number = Number(socket);
        socket = !isNaN(number) ? number : socket;

        this.__base({restartWorker: params.restartWorker});

        if (cluster.isMaster) {
            this.prepairSocket(socket);
            if (params.done) {
                params.done();
            }
        } else {
            this._startHTTP(socket, params.done);
            require(process.argv[1].replace('server.js', 'priv.js'));
        }
    },

    close: function () {
        if (!cluster.isMaster) {
            this._httpServer.close();
        }
    },

    _startHTTP: function (socket, callback) {
        var http = require('http'),
            _this = this,
            httpServer = this._httpServer = http.createServer(function (req, res) {
                _this._getRequestHandler()(req, res);
            });

        httpServer.listen.apply(httpServer, arguments);

        //handling uncaught exception
        process.on('uncaughtException', function (err) {
            console.error('UNCAUGHT EXCEPTION:', err);
            //gracefull exit
            httpServer.close(function () {
                process.exit(1);
            });
            //exit anyway after 2s
            setTimeout(function () {
                process.exit(1);
            }, 2000);
        }.bind(this));
    },

    /**
     * Handle server request
     *
     * @param {Object} params
     * @param {http.ServerRequest} params.req
     * @param {http.ServerResponse} params.res
     */
    _requestHandler: function () {
        throw new Error('Method [_requestHandler] must be set.');
    },

    /**
     * Get request handler
     *
     * @return {Function}
     */
    _getRequestHandler: function () {
        return this._requestHandler;
    },

    /**
     * Assign request handler
     *
     * @param {Function} handler
     */
    setRequestHandler: function (handler) {
        this._requestHandler = handler;
    },

    /**
     * Socket routine
     *
     * @param {String} socket File name
     */
    prepairSocket: function (socket) {
        var fs = require('fs'),
            cluster = require('cluster'),
            isNumber = typeof socket === 'number';
        
        if (!isNumber) {
            try {
                fs.unlinkSync(socket);
            } catch (err) {}
        }

        if (cluster) {
            cluster.on('listening', function (worker, address) {
                console.log('A worker is now connected to ' + address.address);
                if (!isNumber) {
                    fs.chmod(socket, '777');
                }
            });
        }
    }

});

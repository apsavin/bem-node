var assert = require('assert'),
    server = BEM.blocks['i-www-server'],
    router = BEM.blocks['i-router'];


before(function (done) {
    server.init({
        done: done,
        restartWorker: false,
        initialSocket: 8000
    });
});
after(function () {
    server.close();
});
describe('Array', function(){

    describe('#indexOf()', function(){
        it('should return -1 when the value is not present', function(){
            assert.equal(-1, [1,2,3].indexOf(5));
            assert.equal(-1, [1,2,3].indexOf(0));
        })
    })
})

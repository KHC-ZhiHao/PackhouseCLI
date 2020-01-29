let Test = require('packhouse/plugins/Test')
let { expect } = require('chai')

describe('Test', function() {
    this.timeout(0)
    it('hello', function(done) {
        let { handler } = require('../src/handlers/hello')
        handler({
            queryStringParameters: {
                message: 'hello'
            },
            run(packhouse) {
                packhouse.plugin(Test)
                packhouse.test.mock('tool', 'aws@dynamodb/put', options => {
                    options.handler = self => self.success()
                })
            },
            done(packhouse) {
                packhouse.test.restore('tool', 'aws@dynamodb/put')
            }
        }).then(response => {
            expect(response.statusCode).to.equal(200)
            done()
        }).catch(done)
    })
})

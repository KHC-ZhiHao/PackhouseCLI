const Main = require('./main')

const request = event => {
    let body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body
    let query = event.queryStringParameters || {}
    let params = event.pathParameters || {}
    let all = {
        ...body,
        ...query
    }
    return { body, query, params, all }
}

const response = system => (body, statusCode) => {
    system.done = true
    system.export = body
    system.statusCode = statusCode || 200
}

const getHttpResponse = (result, statusCode) => {
    if (result instanceof Error) {
        result = result.message
    }
    if (result && result.error && result.type === 'mold') {
        result.error = result.error.message || result.error
    }
    return {
        body: JSON.stringify(result),
        statusCode: statusCode || 200,
        headers: {
            'Content-Type': 'application/json;charset=utf-8',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Credentials': true
        }
    }
}

exports.api = template => async event => {
    let packhouse = Main(event)
    if (event.run) {
        event.run(packhouse)
    }
    let system = {
        done: false,
        export: null,
        statusCode: null
    }
    let result = await packhouse.step({
        timeout: 20000,
        template,
        create(self, { exit }) {
            self.request = request(event)
            self.response = response(system)
            self.packhouse = packhouse
        },
        middle(self, { exit }) {
            if (system.done) {
                exit()
            }
        },
        output(self, { timeout, history }, done) {
            if (timeout) {
                self.response('Timeout', 408)
            }
            if (system.statusCode !== 200) {
                console.log(history.toJSON({
                    metadata: {
                        code: system.statusCode,
                        result: system.export
                    }
                }))
            }
            if (event.done) {
                event.done(packhouse)
            }
            done(getHttpResponse(system.export, system.statusCode))
        }
    })
    return result
}

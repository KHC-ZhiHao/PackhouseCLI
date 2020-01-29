let { api } = require('../adapter')

exports.handler = api([
    function validate(self, next) {
        let joi = require('@hapi/joi')
        let keys = {
            message: joi.string().required()
        }
        let result = joi.object().keys(keys).validate(self.request.query)
        if (result.error) {
            self.response(result.error, 422)
        }
        next()
    },
    function put(self, next) {
        let { message } = self.request.query
        self.packhouse
            .tool('message/put')
            .always(next)
            .noGood(e => self.response(e, 500))
            .action(message, () => '')
    },
    function result(self, next) {
        self.response(self.request.query.message)
        next()
    }
])

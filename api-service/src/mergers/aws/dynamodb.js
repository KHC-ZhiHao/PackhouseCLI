const group = {}

group.install = function(group) {
    const AWS = require('aws-sdk')
    group.service = new AWS.DynamoDB.DocumentClient({
        apiVersion: '2012-08-10'
    })
}

// ===================
//
// Molds
//

group.molds = {

    /** @mold 將exclusive start key轉成base64 */

    nextToken(value) {
        if (value == null) {
            return null
        }
        return JSON.parse(Buffer.from(value, 'base64').toString('utf8'))
    }
}

// ===================
//
// Tools
//

group.tools = {

    createNextToken: {
        request: ['object?'],
        handler(self, data) {
            if (data == null) {
                return self.success(null)
            }
            self.success(Buffer.from(JSON.stringify(data)).toString('base64'))
        }
    },

    put: {
        request: ['string', 'object'],
        install({ store, group }) {
            store.service = group.service
        },
        handler(self, tableName, items) {
            let params = {
                TableName: tableName,
                Item: items
            }
            self.store
                .service
                .put(params, (err, result) => {
                    if (err) {
                        self.error(err)
                    } else {
                        self.success(result)
                    }
                })
        }
    },

    get: {
        request: ['string', 'object'],
        install({ store, group, packhouse }) {
            store.order = packhouse.order()
            store.service = group.service
        },
        handler(self, tableName, target) {
            let key = JSON.stringify(target)
            let params = {
                TableName: tableName,
                Key: target
            }
            self.store
                .order
                .use(key, self, (error, success) => {
                    self.store
                        .service
                        .get(params, (err, result) => {
                            if (err) {
                                error(err)
                            } else {
                                success(result ? result.Item : null)
                            }
                        })
                })
        }
    },

    delete: {
        request: ['string', 'object'],
        install({ store, group }) {
            store.service = group.service
        },
        handler(self, tableName, key) {
            let params = {
                TableName: tableName,
                Key: key
            }
            self.store
                .service
                .delete(params, (err) => {
                    if (err) {
                        self.error(err)
                    } else {
                        self.success()
                    }
                })
        }
    },

    scan: {
        request: ['string', 'nextToken?', 'object?'],
        install({ store, group, include, packhouse }) {
            store.order = packhouse.order()
            store.service = group.service
            include('createNextToken').tool('createNextToken')
        },
        handler(self, tableName, exclusiveStartKey, options) {
            let params = {
                TableName: tableName,
                ExclusiveStartKey: exclusiveStartKey,
                ...options
            }
            let key = JSON.stringify(params)
            self.store
                .order
                .use(key, self, (error, success) => {
                    self.store
                        .service
                        .scan(params, (err, { LastEvaluatedKey, Items }) => {
                            if (err) {
                                return error(err)
                            }
                            self.tool('createNextToken')
                                .noGood(error)
                                .action(LastEvaluatedKey, nextToken => {
                                    success({
                                        items: Items,
                                        nextToken
                                    })
                                })
                        })
                })
        }
    }
}

// ===================
//
// Lines
//

group.lines = {

    /**
     * @module aws-dynamodb/query
     * @description
     */

    query: {
        request: ['string', 'string', 'string'],
        install({ store, group, include }) {
            store.service = group.service
            include('query').line('query')
            include('createNextToken').tool('createNextToken')
        },
        input(self, tableName, hashKey, key) {
            self.store.all = false
            self.store.key = key
            self.store.hashKey = hashKey
            self.store.tableName = tableName
            self.store.params = {
                TableName: tableName,
                KeyConditionExpression: `#key = :key`,
                ExpressionAttributeNames: { '#key': hashKey },
                ExpressionAttributeValues: { ':key': key }
            }
            self.success()
        },
        output: async(self) => {
            if (self.store.rangeKey) {
                self.store.params.KeyConditionExpression += ' AND #rangeKey BETWEEN :begin AND :finish'
                self.store.params.ExpressionAttributeNames['#rangeKey'] = self.store.rangeKey
            }
            let nextToken = null
            let response = {
                count: 0,
                items: [],
                nextToken: null
            }
            do {
                let result = null
                try {
                    result = await self.store.service.query(self.store.params).promise()
                } catch (error) {
                    return self.error(error)
                }
                nextToken = result.LastEvaluatedKey
                response.items = response.items.concat(result.Items)
                response.count += result.Count || 0
                if (self.store.all && nextToken) {
                    self.store.params.ExclusiveStartKey = nextToken
                }
            } while (self.store.all && nextToken)

            self.tool('createNextToken')
                .noGood(self.error)
                .action(nextToken, nextToken => {
                    response.nextToken = nextToken
                    self.success(response)
                })
        },
        layout: {
            all: {
                handler(self) {
                    self.store.all = true
                    self.success()
                }
            },
            index: {
                request: ['string'],
                handler(self, name) {
                    self.store.params.IndexName = name
                    self.success()
                }
            },
            limit: {
                request: ['number|min:1'],
                handler(self, limit) {
                    self.store.params.Limit = limit
                    self.success()
                }
            },
            select: {
                request: ['string|is: COUNT, ALL_ATTRIBUTES, ALL_PROJECTED_ATTRIBUTES, SPECIFIC_ATTRIBUTES'],
                handler(self, target) {
                    self.store.params.Select = target
                    self.success()
                }
            },
            params: {
                request: ['object'],
                handler(self, params) {
                    self.store.params = params
                    self.success()
                }
            },
            forward: {
                request: ['boolean?'],
                handler(self, bool = false) {
                    self.store.params.ScanIndexForward = bool
                    self.success()
                }
            },
            between: {
                request: ['string', 'required', 'required'],
                handler(self, rangeKey, begin, finish) {
                    self.store.rangeKey = rangeKey
                    self.store.params.ExpressionAttributeValues[':begin'] = begin
                    self.store.params.ExpressionAttributeValues[':finish'] = finish
                    self.success()
                }
            },
            nextToken: {
                request: ['nextToken'],
                handler(self, exclusiveStartKey) {
                    self.store.params.ExclusiveStartKey = exclusiveStartKey
                    self.success()
                }
            }
        }
    },

    update: {
        request: ['string', 'object'],
        install({ store, group, include }) {
            include('get').tool('get')
            include('put').tool('put')
            store.service = group.service
        },
        input(self, tableName, target) {
            self.store.target = target
            self.store.tableName = tableName
            self.store.expression = []
            self.store.expressionAttributeNames = {}
            self.store.expressionAttributeValues = {}
            self.success()
        },
        output(self) {
            let params = {
                TableName: self.store.tableName,
                Key: self.store.target,
                UpdateExpression: `set ${self.store.expression.join(', ')}`,
                ExpressionAttributeNames: self.store.expressionAttributeNames,
                ExpressionAttributeValues: self.store.expressionAttributeValues
            }
            self.store
                .service
                .update(params, (error, result) => {
                    if (error) {
                        self.error(error)
                    } else {
                        self.success(result)
                    }
                })
        },
        layout: {
            orCreate: {
                request: ['object'],
                handler: async(self, items) => {
                    let { tableName, target } = self.store
                    let item = await self.tool('get').noGood(self.error).promise(tableName, target)
                    if (item) {
                        self.success()
                    } else {
                        self.tool('put')
                            .noGood(self.error)
                            .action(tableName, { ...target, ...items }, self.success)
                    }
                }
            },
            setItem: {
                request: ['string', null, 'string?'],
                handler(self, key, value, express = '{value}') {
                    let keyName = `#${key}`
                    let attrName = `:${key}`
                    let expression = express.replace(/{value}/g, attrName).replace(/{key}/g, keyName)
                    self.store.expression.push(`${keyName} = ${expression}`)
                    self.store.expressionAttributeNames[keyName] = key
                    self.store.expressionAttributeValues[attrName] = value
                    self.success()
                }
            }
        }
    },

    batch: {
        request: ['string'],
        install({ store, group }) {
            store.service = group.service
        },
        input(self, tableName) {
            self.store.items = []
            self.store.tableName = tableName
            self.success()
        },
        output(self) {
            let all = []
            let items = []
            for (let i = 0; i < self.store.items.length; i += 25) {
                items.push(self.store.items.slice(i, i + 25))
            }
            for (let item of items) {
                let params = {
                    RequestItems: {
                        [self.store.tableName]: item
                    }
                }
                all.push(self.store.service.batchWrite(params).promise())
            }
            Promise.all(all).then(self.success).catch(self.error)
        },
        layout: {
            put: {
                request: ['object'],
                handler: async(self, items) => {
                    self.store.items.push({
                        PutRequest: {
                            Item: items
                        }
                    })
                    self.success()
                }
            },
            remove: {
                request: ['object'],
                handler(self, target) {
                    self.store.items.push({
                        DeleteRequest: {
                            Key: target
                        }
                    })
                    self.success()
                }
            }
        }
    }
}

module.exports = group

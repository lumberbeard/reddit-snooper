"use strict"

var Api = require("./api")
// var Watcher = require("./watcher")

module.exports = function (options) {
    // error check options
    options.user_agent = options.user_agent || "javascript.getcomments.v1"

    const api = Api(options)
    // const watcher = Watcher(options)

    return {
        api:     api,
        // watcher: watcher
    }
}




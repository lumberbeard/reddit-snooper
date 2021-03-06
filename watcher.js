"use strict"

const request = require("request")
var Api = require("./api");
var options = {

  app_id: '3F56OzxrWIL8Sg',
  api_secret: 'TBNgiWgIDxQlhM2sv6btVYpfbXc',
  user_agent: 'javascript.getcomments.v1',

  automatic_retries: true, // automatically handles condition when reddit says 'you are doing this too much'
  api_requests_per_minute: 60 // api requests will be spread out in order to play nicely with Reddit  
}
const api = Api(options);
// snooper = new Snooper({
//   // credential information is not needed for snooper.watcher
//   // username: 'reddit_username',
//   // password: 'reddit password',
//   app_id: '3F56OzxrWIL8Sg',
//   api_secret: 'TBNgiWgIDxQlhM2sv6btVYpfbXc',
//   user_agent: 'javascript.getcomments.v1',

//   automatic_retries: true, // automatically handles condition when reddit says 'you are doing this too much'
//   api_requests_per_minute: 60 // api requests will be spread out in order to play nicely with Reddit
// });
const EventEmitter = require("events")
var rn = require('random-number');
var randomTime = rn.generator({ min:  1000, max: 200000, integer: true });
const he = require("he").decode;


module.exports = function (snooper_options) {

    class RedditWatcher extends EventEmitter {
        constructor(start_page, item_type, options, category, timeout) {
            super()
            this.category = category
            this.item_type = item_type
            this.options = options
            this.start_page = start_page
            this.is_closed = false
            this.wait_interval = options.wait
            this.retries = 3
            this.timeout = timeout
            

            this.once("newListener", (event, listener) => {
                if (event === this.item_type) {
                    this.start()
                } else {
                    throw "event type not recognized, use a valid event type like: error or " + this.item_type
                }
            })
        }

        start() {
            console.log("NOOP")
        }

        close() {
            this.is_closed = true
        }


        get_items(category, start_page, after_name, posts_needed, until_name, cb_first_item, cb) {
            this._get_items(category, start_page, after_name, posts_needed, until_name, [], this.retries, cb_first_item, cb)
        }

        // calls the callback with a list of items
        // stop when we reach until_need or we get all posts_needed (whichever comes first)
        _get_items(category, start_page, after_name, posts_needed, until_name, items, retries, cb_first_item, cb) {
            
            if (this.is_closed) {
                return
            }

            request({
                url: start_page,
                qs:  {after: after_name}
            }, async (err, res, body_json) => {
                let body

                if (!err) {
                    try {
                        body = JSON.parse(body_json)
                    } catch (_err) {
                        err = _err
                    }
                }

                if (err && retries > 0) {
                    return this._get_items(category, start_page, after_name, posts_needed, until_name, items, retries-1, cb_first_item, cb)
                } else if (err) {
                    cb(err)
                }
                let children = body.data.children

                if (children.length > 0) {
                    if (!after_name && cb_first_item) cb_first_item(children[0].data.name)

                    //after_name = children[children.length - 1].data.name,
                    let is_done = false

                    // stop if posts_needed is reached
                    if (posts_needed!== null && children.length >= posts_needed) {
                        children = children.slice(0, posts_needed)
                        is_done = true
                    }

                    // stop if until_name is reached
                    if (until_name) {
                        for (let i = 0; i < children.length; i++) {
                            if (children[i].data.name === until_name) {
                                children = children.slice(0, i)
                                is_done = true
                                this.emit('done')
                                break
                            }
                        }
                    }

                    // this makes it so feeds dont receive current data
                    if (!until_name && !posts_needed && posts_needed !== 0){
                        return
                    }

                    items = items.concat(children)

                    if (!is_done) {
                        this._get_items(
                            category,
                            start_page,
                            children[children.length - 1].data.name,
                            posts_needed ? posts_needed - children.length : posts_needed, // leave it null
                            until_name,
                            items,
                            this.retries,
                            cb_first_item,
                            cb)
                    } else {
                        var completedItems = [];
                        items.map(function (i,index,array) {
                            // queue = queue.then(async function(res){
                                api.get("https://www.reddit.com" + i.data.permalink + '.json', null, function(err, responseCode, responseData) {
                                    let comments = gatherComment(err,responseCode,responseData);
                                    if (comments){
                                        i.data.comments = comments;
                                    }
                                    completedItems.push(i)
                                    if (array.length === completedItems.length){
                                        cb(null, completedItems)
                                        this.emit('done', start_page, category)
                                    }
                                }.bind(this))
                        }.bind(this))
                    }

                } else {
                    cb('Requested too many items (reddit does not keep this large of a listing)', items)
                }
                function gatherComment(err, responseCode,responseData){
                    var commentChain = []
                    if (err) {
                        return console.error("api request failed: " + err)
                    }
                    for (let ci of responseData[1].data.children){
                      let comment = structureComment(ci.data);
                      if (comment) commentChain.push(comment);
                  
                      function structureComment(item){
                        if (item.replies && item.replies.data.children[0].kind != 'more'){
                          let replies = item.replies.data.children.map(cir => structureComment(cir.data)).filter(Boolean);
                          if (replies){
                            return {
                                author: item.author,
                                score: item.score,
                                body: he(item.body),
                                replies: replies
                            }
                          } else {
                            return {
                                author: item.author,
                                score: item.score,
                                body: he(item.body),
                            }
                          }
                        } else if(item.author && item.score > 0) {
                          return {
                            author: item.author,
                            score: item.score,
                            body: he(item.body),
                          }
                        }
                      }
                    }
                    return commentChain
                  }
            })
        }
        
    }

    class RedditListingWatcher extends RedditWatcher {
        constructor(start_page, item_type, options, category, timeout) {
            super(start_page, item_type, options, category, timeout)

            this.timeout = timeout;
            this.limit = options.limit || 25
            this.seen_items = []
            this.seen_items_size = this.limit * 5
        }

        start() {
            if (this.is_closed)
                return

            setTimeout(() => {
                this.get_items(this.category, this.start_page, '', this.limit, '', null, (err, data) => {
                    if (err) return this.emit('error', err)

                    let new_data = 0

                    for (let i = 0; i < data.length; i++) {
                        if (this.seen_items.indexOf(data[i].data.name) < 0) {
                            new_data++

                            this.emit(this.item_type, data[i], this.category)

                            this.seen_items.push(data[i].data.name)

                            if (this.seen_items.length > this.seen_items_size)
                                this.seen_items.shift()
                        }
                    }

                    // this.start()
                })
            }, this.timeout)
        }
    }

    // TODO: Refactor this to use RedditWatcher.get_items()
    class RedditFeedWatcher extends RedditWatcher {
        constructor(start_page, item_type, options) {
            super(start_page, item_type, options)
        }

        _start(until_name) {
            if (this.is_closed)
                return


            //get_items(start_page, after_name, posts_needed, until_name, cb_first_item, cb)

            setTimeout(() => {
                this.get_items(this.start_page, '', null, until_name,(first_comment_retrieved) => {
                    this._start(first_comment_retrieved)
                }, (err, data) => {
                    if (err) return this.emit('error', err)
                    data.map((item) => {
                        this.emit(this.item_type, item)
                    })
                })
            }, this.wait_interval)

        }

        start() {
            this._start('')
        }
    }
 
    function getCommentWatcher(subreddit, options, postId) {
        subreddit = subreddit.trim().replace("/", "")
        let start_page
        if (postId){
            start_page = "https://reddit.com/r/" + subreddit + "/comments/" + postID + ".json"
        } else {
            start_page = "https://reddit.com/r/" + subreddit + "/comments.json"  
        }

        return new RedditFeedWatcher(start_page, "comment", options)
    }

    function getPostWatcher(subreddit, options) {
        subreddit = subreddit.trim().replace("/", "")
        let start_page = "https://reddit.com/r/" + subreddit + "/new.json"

        return new RedditFeedWatcher(start_page, "post", options)
    } 

    function getMultiWatcher(username, multi, options) { //test
        username = username.trim().replace("/", "")
        multi = multi.trim().replace("/", "")
        let start_page = "https://reddit.com/user/" + username + "/m/" + multi + "/new.json"

        return new RedditFeedWatcher(start_page, "post", options)
    }

    function getGildedWatcher(subreddit, options) {

    }

    // listings are reddit pages where posts can show pop in and out in no particular order or location
    // as opposed to feeds which sequentially display new content

    // listings: hot, rising, controversial, top_day, top_hour, top_week, top_month, top_year, top_all
    function getListingWatcher(subreddits, options, category, timeout) {
        let subs;
        options.listing = options.listing || 'hot'
        if (Array.isArray(subreddits)){
            subreddits.forEach(s => subs += '+'+s);
            subs.substring(1, subs.length);
        } else {
            subs = subreddits ? 'r/' + subreddits : ''
        }
        let start_page = 'https://reddit.com/' + subs + '/'
        if (options.listing === 'hot' || options.listing === 'rising' || options.listing === 'controversial' || options.listing === 'top') {
            start_page += options.listing + '.json'
        } else if (options.listing === 'top_day' || options.listing === 'top_hour' || options.listing === 'top_month'
            || options.listing === 'top_year' || options.listing === 'top_all') {
            start_page += 'top.json?sort=top&t=' + options.listing.substring(4, options.listing.length)
        } else {
            throw "invalid listing type"
        }
        console.log(category.name)
        
        return new RedditListingWatcher(start_page, 'item', options, category, timeout)
    }

    return {
        getCommentWatcher,
        getPostWatcher,
        getGildedWatcher,
        getListingWatcher,
        getMultiWatcher
    }

}

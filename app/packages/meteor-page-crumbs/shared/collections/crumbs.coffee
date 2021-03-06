class @Crumb
  constructor: (doc) ->
    _.extend this, doc

  creator: ->
    Meteor.users.findOne _id: @creatorId

@Crumbs = new Meteor.Collection("crumbs",
  transform: (doc) ->
    new Crumb(doc)
)

Crumbs.before.insert BeforeInsertTimestampHook
Crumbs.before.update BeforeUpdateTimestampHook

Meteor.methods
  'createCrumb': (postId, lang) ->
    checkIfAdmin()
    check(postId, String)

    post = Posts.findOne
      _id: postId
    throw new Meteor.Error(403, "post with _id #{postId} not found") unless post?

    index = Crumbs.find
      postId: postId
      lang: lang
    .count()

    console.log "create crumb"
    _id = Crumbs.insert
      postId: postId
      lang: lang
      creatorId: Meteor.userId()
      index: index
    _id

  'decCrumbIndex': (crumbId) ->
    checkIfAdmin()
    check(crumbId, String)

    crumb = Crumbs.findOne
      _id: crumbId
    throw new Meteor.Error(403, "crumb not found") unless crumb?

    return if crumb.index is 0

    Crumbs.update
      postId: crumb.postId
      lang: crumb.lang
      index: crumb.index-1
    ,
      $inc: {index: 1}

    Crumbs.update crumbId,
      $inc: {index: -1}


  'incCrumbIndex': (crumbId) ->
    checkIfAdmin()
    check(crumbId, String)

    crumb = Crumbs.findOne
      _id: crumbId
    throw new Meteor.Error(403, "crumb not found") unless crumb?

    numCrumbs = Crumbs.find().count()
    return if crumb.index is numCrumbs-1

    Crumbs.update
      postId: crumb.postId
      lang: crumb.lang
      index: crumb.index+1
    ,
      $inc: {index: -1}

    Crumbs.update crumbId,
      $inc: {index: 1}


  'saveCrumb': (crumbId, markdown) ->
    checkIfAdmin()
    check(crumbId, String)
    markdown = null if markdown? and markdown.length is 0
    check(markdown, String)

    crumb = Crumbs.findOne
      _id: crumbId
    throw new Meteor.Error(403, "crumb with _id #{crumbId} not found") unless crumb?

    Crumbs.update crumbId,
      $set: {content: markdown}

  'removeCrumb': (crumbId) ->
    checkIfAdmin()
    check(crumbId, String)

    crumb = Crumbs.findOne
      _id: crumbId
    throw new Meteor.Error(403, "crumb with _id #{crumbId} not found") unless crumb?

    Crumbs.remove crumbId

    Crumbs.update
      postId: crumb.postId
      lang: crumb.lang
      index: {$gt: crumb.index}
    ,
      $inc: {index: -1}
    ,
      multi: true

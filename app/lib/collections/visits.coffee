class @Visit
  constructor: (doc) ->
    _.extend this, doc

  proPercent: ->
    answers = Answers.find(
      visitId: @_id
    ).fetch()
    Answer.getProPercent(answers)


@Visits = new Meteor.Collection("visits",
  transform: (doc) ->
    new Visit(doc)
)

Visits.before.insert BeforeInsertTimestampHook
Visits.before.update BeforeUpdateTimestampHook

Visits.allow
  update: (userId, doc, fieldNames, modifier) ->
    if Roles.userIsInRole userId, ['admin']
      return true
    false


Meteor.methods
  "createVisit": ->
    throw new Meteor.Error(400, "you need to log in to init a visit") unless Meteor.userId()?

    visit =
      userId: Meteor.userId()
      completed: false

    _id = Visits.insert visit
    _id


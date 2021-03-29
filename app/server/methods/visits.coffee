Meteor.methods
  "resetVisit": (visitId) ->
    throw new Meteor.Error(400, "you need to login to reset a visit") unless Meteor.userId()?
    check visitId, String

    visit = Visits.findOne
      _id: visitId
      userId: Meteor.userId()
    throw new Meteor.Error(400, "visit not found") unless visit?

    answerCount = Answers.find(
      visitId: visit._id
    ).count()

    id = Meteor.call "createVisit"

    if answerCount < 5
      Visits.remove visit._id

    console.log('reset', visitId, id)
    return id

#fs = Npm.require('fs')
#readline = Npm.require('readline')
Stream = Npm.require('stream')

deleteAndImportQuestions = ->
  Questions.remove({})
  Answers.remove({})
  Visits.remove({})
  i=0
  #fs.createReadStream(process.env.PWD+"/private/questions.csv").pipe( csv(
  #request.get(Meteor.absoluteUrl()+'/questions.csv').pipe( csv(
  url = Meteor.absoluteUrl()+'questions.csv'
  console.log('Downloading '+url)
  HTTP.get url, (error, result) ->
    if error?
      console.log error
      throw new Meteor.Error("failed to load questions.csv", error, url)
    s = new Stream.Readable()
    s._read = -> {}
    s.push(result.content)
    s.push(null)
    s.pipe( csv(
      headers: false
      delimiter: ';'
      ignoreEmpty: true
    ))
    .on('data', Meteor.bindEnvironment (columns) ->
      i+=1
      return if i is 1 #header
      leftPositiv = columns[6].length > 0
      oneSided = columns[7].length > 0
      onlyNegativ = columns[8].length > 0
      min = -0.5
      max = 0.5
      if not oneSided and leftPositiv
        min = max
        max = -0.5
      if oneSided
        if leftPositiv
          max = 0
          if onlyNegativ
            min = -0.5
          else
            min = 0.5
        else
          min = 0
          if onlyNegativ
            max = -0.5
          else
            max = 0.5
      if not oneSided and onlyNegativ
        console.log "heeeeeeeeeeeeeeeeelp"
      question =
        index: parseInt(columns[0])-1
        cluster: columns[1]
        topic: columns[2]
        hrid: columns[3]
        #label: columns[4]
        #info: columns[11].replace(/"/g, '') if columns[11]?
        optional: true
        type: "scale"
        min: min
        max: max
        #minLabel: columns[9]
        #maxLabel: columns[10]
        step: Math.abs(max-min)/10
        start: 0
        isOneSided: oneSided
        isOnlyNegative: onlyNegativ
        isLeftPositiv: leftPositiv
        languages:
          de:
            label: columns[4]
            minLabel: columns[9]
            maxLabel: columns[10]
            info: columns[11].replace(/"/g, '') if columns[11]?
          fr:
            label: columns[12]
            minLabel: columns[13]
            maxLabel: columns[14]
            info: columns[15].replace(/"/g, '') if columns[15]?
          it:
            label: columns[16]
            minLabel: columns[17]
            maxLabel: columns[18]
            info: columns[19].replace(/"/g, '') if columns[19]?
      console.log question
      Questions.insert question
      return
    ).on 'end', Meteor.bindEnvironment ->
      console.log Questions.find().count()+" questions imported"
      return

Meteor.methods
  'deleteAndImportQuestions': ->
    throw new Meteor.Error(400, "you need to log in") unless Meteor.userId()?
    throw new Meteor.Error(403, "admin privileges required") unless Roles.userIsInRole(Meteor.userId(), 'admin')
    deleteAndImportQuestions()

if Questions.find().count() is 0
  deleteAndImportQuestions()

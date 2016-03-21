Package.describe({
  name: 'patte:meteor-files',
  version: '0.0.1',
  summary: 'simple file upload and sharing',
  documentation: 'README.md'
});

Package.onUse(function(api) {
  api.versionsFrom('1.2.1');
  api.use('ecmascript');
  api.use(['livedata', 'underscore', 'deps', 'templating', 'ui', 'blaze', 'ejson', 'reactive-var', 'jquery', 'less'], 'client');
  api.use(['coffeescript', 'check'], ['client', 'server']);
  api.use('iron:router@1.0.12', ['client', 'server']);
  api.use('tap:i18n@1.7.0', ['client', 'server']);
  api.use('cfs:standard-packages@0.5.9', ['client', 'server']);
  api.use('cfs:gridfs@0.0.33', ['client', 'server']);
  api.use('alanning:roles@1.2.14', ['client', 'server']);

  // Generated with: github.com/philcockfield/meteor-package-paths
  api.addFiles('shared/collections/files.coffee', ['client', 'server']);
  api.addFiles('shared/check_roles.coffee', ['client', 'server']);
  api.addFiles('shared/router.coffee', ['client', 'server']);
  api.addFiles('server/publications.coffee', 'server');
  api.addFiles('client/views/files/files.html', 'client');
  api.addFiles('client/lib/clipboardjs/clipboard.min.js', 'client');
  api.addFiles('client/lib/clipboardjs/init_clipboard.js', 'client');
  api.addFiles('client/views/files/files.coffee', 'client');
  api.addFiles('client/helpers/file_icon.coffee', 'client');
  api.addFiles('client/stylesheets/files.less', 'client');

});

Package.onTest(function(api) {
  api.use('ecmascript');
  api.use('tinytest');

  // Generated with: github.com/philcockfield/meteor-package-paths
  

});

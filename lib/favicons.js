'use strict';
var loaderUtils = require('loader-utils');
var favicons = require('favicons');
var faviconPersitenceCache = require('./cache');

module.exports = function(content) {
  var self = this;
  self.cacheable && this.cacheable();
  if (!self.emitFile)
    throw new Error('emitFile is required from module system');
  if (!self.async) throw new Error('async is required');

  var callback = self.async();
  var query = loaderUtils.parseQuery(self.query);
  var pathPrefix = loaderUtils.interpolateName(self, query.prefix, {
    context: query.context || this.options.context,
    content: content,
    regExp: query.regExp
  });
  var fileHash = loaderUtils.interpolateName(self, '[hash]', {
    context: query.context || this.options.context,
    content: content,
    regExp: query.regExp
  });
  var cacheFile = pathPrefix + '.cache';
  faviconPersitenceCache.loadIconsFromDiskCache(
    self,
    query,
    cacheFile,
    fileHash,
    function(err, cachedResult) {
      if (err) return callback(err);
      if (cachedResult) {
        return callback(
          null,
          'module.exports = ' + JSON.stringify(cachedResult)
        );
      }
      // Generate icons
      generateIcons(self, content, pathPrefix, query, function(
        err,
        iconResult
      ) {
        if (err) return callback(err);
        faviconPersitenceCache.emitCacheInformationFile(
          self,
          query,
          cacheFile,
          fileHash,
          iconResult
        );
        return callback(null, 'module.exports = ' + JSON.stringify(iconResult));
      });
    }
  );
};

function getPublicPath(compilation) {
  var publicPath = compilation.outputOptions.publicPath || '';
  if (publicPath.length && publicPath.substr(-1) !== '/') {
    publicPath += '/';
  }
  return publicPath;
}

function generateIcons(loader, imageFileStream, pathPrefix, query, callback) {
  var publicPath = getPublicPath(loader._compilation);
  var config = favicons.config.html;
  config.appleIcon[
    "meta[name='apple-mobile-web-app-status-bar-style']"
  ] = `<meta name='apple-mobile-web-app-status-bar-style' content='${query
    .config.appleStatusBarStyle}'>`;

  favicons(
    imageFileStream,
    Object.assign({}, query.config, { path: '', url: '' }),
    function(err, result) {
      if (err) return callback(err);
      var html = result.html.map(function(entry) {
        return entry
          .replace(/(href=[""])/g, '$1' + publicPath + pathPrefix)
          .replace(
            /(msapplication-(TileImage|config)" content=")/g,
            '$1' + publicPath + pathPrefix
          );
      });
      var loaderResult = {
        prefix: pathPrefix,
        html: html,
        files: []
      };
      result.images.forEach(function(image) {
        loaderResult.files.push(pathPrefix + image.name);
        loader.emitFile(pathPrefix + image.name, image.contents);
      });
      result.files.forEach(function(file) {
        loaderResult.files.push(pathPrefix + file.name);
        if (file.name === 'manifest.json' && query.config.gcm_sender_id) {
          var ney = JSON.parse(file.contents);
          for (var i = 0, l = ney.icons.length; i < l; i++) {
            ney.icons[i].src = '/icons/' + ney.icons[i].src;
          }
          ney.gcm_sender_id = query.config.gcm_sender_id;
          file.contents = JSON.stringify(sortObject(ney), null, 4);
        }
        loader.emitFile(pathPrefix + file.name, file.contents);
      });
      callback(null, loaderResult);
    }
  );
}

function sortObject(o) {
  var sorted = {},
    key,
    a = [];

  for (key in o) {
    if (o.hasOwnProperty(key)) {
      a.push(key);
    }
  }

  a.sort();

  for (key = 0; key < a.length; key++) {
    sorted[a[key]] = o[a[key]];
  }
  return sorted;
}
module.exports.raw = true;

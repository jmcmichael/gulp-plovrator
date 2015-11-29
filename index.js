var Buffer = require('buffer').Buffer;
var child_process = require('child_process');
var fs = require('graceful-fs');
var glob = require('glob');
var gutil = require('gulp-util');
var mkdirp = require('mkdirp');
var path = require('path');
var temp = require('temp').track();
var through = require('through');
var uuid = require('uuid');
var revHash = require('rev-hash');
var revPath = require('rev-path');

const PLUGIN_NAME = 'gulp-plovrator';

module.exports = function(opt, execFile_opt) {
  opt = opt || {};
  opt.maxBuffer = opt.maxBuffer || 1000;
  opt.continueWithWarnings = opt.continueWithWarnings || false;
  var files = [];
  var execFile = execFile_opt || child_process.execFile;

  if (!opt.fileName && !hasModules())
    throw new gutil.PluginError(PLUGIN_NAME, 'Missing fileName option.');

  // Can't use sindresorhus/dargs, compiler requires own syntax.
  var flagsToArgs = function(flags) {
    var args = [];
    for (var flag in flags || {}) {
      var values = flags[flag];
      if (!Array.isArray(values)) values = [values];
      values.forEach(function(value) {
        if (flag === 'externs') {
          glob.sync(value).forEach(function(resolved){
            args.push(buildFlag(flag, resolved))
          });
        } else {
          args.push(buildFlag(flag, value));
        }
      });
    }
    return args;
  };

  var buildFlag = function(flag, value){
    return '--' + flag + (value === null ? '' : '=' + value)
  };

  function bufferContents(file) {
    if (file.isNull()) return;
    if (file.isStream()) {
      return this.emit('error',
        new gutil.PluginError(PLUGIN_NAME, 'Streaming not supported'));
    }
    files.push(file);
  }

  function hasModules(){
    var properties = Object.getOwnPropertyNames(opt.compilerFlags || {});
    return properties.indexOf("module") && properties.indexOf("module_output_path_prefix");
  }


  function endStream() {
    temp.mkdir('closure-compiler-temp', function(err, tmpPath){
      if (!files.length) return this.emit('end');

      var firstFile = files[0],
        appFile = files[2]; // ugly - figure out a better way to identify the app file

      // create flag file
      var flagFileTxt = files.map(function(file) {
        var relativePath = path.relative(file.cwd, file.path);
        return '--js="' + relativePath + '"';
      }).join('\n');
      var flagFilePath = tmpPath + '/flagFile.txt';
      fs.writeFileSync(flagFilePath, flagFileTxt);

      // create args
      var args;
      if (opt.compilerPath) {
        args = [
          '-jar',
          // For faster compilation. It's supported everywhere from Java 1.7+.
          opt.tieredCompilation ? '-XX:+TieredCompilation' : '-XX:-TieredCompilation',
          opt.compilerPath,
          // To prevent maximum length of command line string exceeded error.
          '--flagfile="' + flagFilePath + '"'
        ];
      } else {
        args = [
          // To prevent maximum length of command line string exceeded error.
          '--flagfile="' + flagFilePath + '"'
        ];
      }
      args = args.concat(flagsToArgs(opt.compilerFlags));

      var javaFlags = opt.javaFlags || [];
      args = javaFlags.concat(args);

      var outputFilePath = tmpPath + '/' + opt.fileName;
      // Force --js_output_file to prevent [Error: stdout maxBuffer exceeded.]
      args.push('--js_output_file="' + outputFilePath + '"');


      if (opt.createSourceMap === true) {
        var sourcemapName = opt.fileName + '.map';
        var sourcemapFilePath = tmpPath + '/' + sourcemapName;
        args.push('--create_source_map="' + sourcemapFilePath + '"');
      }

      // Enable custom max buffer to fix "stderr maxBuffer exceeded" error. Default is 1000*1024.
      var executable = opt.compilerPath ? 'java' : 'closure-compiler';
      var jar = execFile(executable, args, { maxBuffer: opt.maxBuffer*1024 }, function(error, stdout, stderr) {
        if (error || (stderr && !opt.continueWithWarnings)) {
          this.emit('error', new gutil.PluginError(PLUGIN_NAME, error || stderr));
          return;
        }

        if (stderr) {
          gutil.log(stderr);
        }

        // fetch and emit compiled file
        try {
          var compiled = fs.readFileSync(outputFilePath);
        } catch (err) {
          this.emit('error', new gutil.PluginError(PLUGIN_NAME, err));
        }

        if(opt.fingerprint) {
          var cHash = revHash(compiled);
          var cPath = revPath(path.join(tmpPath, opt.fileName), cHash)
        } else {
          var cPath = path.join(tmpPath, opt.fileName);
        }


        var compiledFile = new gutil.File({
          base: tmpPath,
          contents: compiled,
          cwd: tmpPath,
          path: cPath
        });

        // fetch and emit sourcemap, if requested
        if(opt.createSourceMap === true) {
          try {
            var sourcemap = fs.readFileSync(sourcemapFilePath);
          } catch (err) {
            this.emit('error', new gutil.PluginError(PLUGIN_NAME, err));
          }

          if(opt.fingerprint) {
            var sPath = revPath(path.join(tmpPath, sourcemapName), cHash)
          } else {
            var sPath = path.join(tmpPath, sourcemapName);
          }

          var sourcemapFile = new gutil.File({
            base: tmpPath,
            contents: sourcemap,
            cwd: tmpPath,
            path: sPath
          });

          // append sourcemap comment to compiled file
          var mapComment = new Buffer('//# sourceMappingURL=' + path.basename(sPath));
          compiledFile = new gutil.File({
            base: tmpPath,
            contents: Buffer.concat([compiled, mapComment]),
            cwd: tmpPath,
            path: cPath
          });
        }
        this.emit('data', compiledFile);
        if(opt.createSourceMap === true) { this.emit('data', sourcemapFile); }
        this.emit('end');
      }.bind(this));
    }.bind(this))
  }

  return through(bufferContents, endStream);
};

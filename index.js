var Buffer = require('buffer').Buffer;
var child_process = require('child_process');
var fs = require('graceful-fs');
var glob = require('glob');
var gutil = require('gulp-util');
var mkdirp = require('mkdirp');
var path = require('path');
var tempWrite = require('temp-write');
var through = require('through');
var tmpdir = require('os').tmpdir();
var uuid = require('uuid');

const PLUGIN_NAME = 'gulp-closure-compiler';

module.exports = function(opt, execFile_opt) {
  opt = opt || {};
  opt.maxBuffer = opt.maxBuffer || 1000;
  opt.continueWithWarnings = opt.continueWithWarnings || false;
  var files = [];
  var execFile = execFile_opt || child_process.execFile;

  if (!opt.fileName && !hasModules())
    throw new gutil.PluginError(PLUGIN_NAME, 'Missing fileName option.');

  var getFlagFilePath = function(files) {
    var src = files.map(function(file) {
      var relativePath = path.relative(file.cwd, file.path);
      return '--js="' + relativePath + '"';
    }).join('\n');
    return tempWrite.sync(src);
  };

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
    if (!files.length) return this.emit('end');
    var firstFile = files[0],
      appFile = files[2]; // this is REALLY ugly - we really have no idea which file is the app file
    var outputFilePath = tempWrite.sync('');
    var args;
    if (opt.compilerPath) {
      args = [
        '-jar',
        // For faster compilation. It's supported everywhere from Java 1.7+.
        opt.tieredCompilation ? '-XX:+TieredCompilation' : '-XX:-TieredCompilation',
        opt.compilerPath,
        // To prevent maximum length of command line string exceeded error.
        '--flagfile="' + getFlagFilePath(files) + '"'
      ];
    } else {
      args = [
        // To prevent maximum length of command line string exceeded error.
        '--flagfile="' + getFlagFilePath(files) + '"'
      ];
    }
    args = args.concat(flagsToArgs(opt.compilerFlags));

    var javaFlags = opt.javaFlags || [];
    args = javaFlags.concat(args);

    // Force --js_output_file to prevent [Error: stdout maxBuffer exceeded.]
    args.push('--js_output_file="' + opt.fileName + '"');

    if (opt.createSourceMap === true) {
      var sourcemapName = opt.fileName + '.map';
      args.push('--create_source_map="' + sourcemapName + '"');
    }

    // Create directory for output file if it doesn't exist.
    if (opt.fileName && !fs.existsSync(path.dirname(opt.fileName))) {
      fs.mkdirSync(path.dirname(opt.fileName));
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
        var compiled = fs.readFileSync(opt.fileName);
      } catch (err) {
        this.emit('error', new gutil.PluginError(PLUGIN_NAME, err));
      }
      var compiledFile = new gutil.File({
        base: appFile.base,
        contents: compiled,
        cwd: appFile.cwd,
        path: path.join(appFile.base, opt.fileName)
      });
      this.emit('data', compiledFile);

      // fetch and emit sourcemap, if requested
      if(opt.createSourceMap === true) {
        try {
          var sourcemap = fs.readFileSync(sourcemapName);
        } catch (err) {
          this.emit('error', new gutil.PluginError(PLUGIN_NAME, err));
        }

        var sourcemapFile = new gutil.File({
          base: appFile.base,
          contents: sourcemap,
          cwd: appFile.cwd,
          path: path.join(appFile.base, sourcemapName)
        });
        this.emit('data', sourcemapFile);
      }
      this.emit('end');
    }.bind(this));
  }

  return through(bufferContents, endStream);
};

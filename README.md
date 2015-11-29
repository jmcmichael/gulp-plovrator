# [gulp](http://gulpjs.com)-plovrator
> Gulp plugin that (will eventually) emulate the [Plovr build tool](https://github.com/bolinfest/plovr) for the Closure compiler
(a fork of [gulp-closure-compiler](https://github.com/steida/gulp-closure-compiler))

*Issues with the output or Java should be reported on the Closure Compiler [issue tracker](https://github.com/google/closure-compiler/issues).*

## Install

```
npm install --save-dev gulp-plovrator
```

## Example

### Simple optimizations

Simple optimizations for classic minifying.

```js
var gulp = require('gulp');
var closureCompiler = require('gulp-plovrator');

gulp.task('default', function() {
  return gulp.src('src/*.js')
    .pipe(closureCompiler({
      compilerPath: 'bower_components/closure-compiler/lib/vendor/compiler.jar',
      fileName: 'build.js'
    }))
    .pipe(gulp.dest('dist'));
});
```

### Advanced optimizations

Advanced optimizations is much more aggressive. It's aimed for libraries like [Closure Library](https://developers.google.com/closure/library/).

```js
var gulp = require('gulp');
var closureCompiler = require('gulp-ploverator');

gulp.task('default', function() {
  return gulp.src('src/*.js')
    .pipe(closureCompiler({
      compilerPath: 'bower_components/closure-compiler/lib/vendor/compiler.jar',
      fileName: 'build.js',
      compilerFlags: {
        closure_entry_point: 'app.main',
        compilation_level: 'ADVANCED_OPTIMIZATIONS',
        define: [
          "goog.DEBUG=false"
        ],
        externs: [
          'bower_components/este-library/externs/react.js'
        ],
        extra_annotation_name: 'jsx',
        only_closure_dependencies: true,
        // .call is super important, otherwise Closure Library will not work in strict mode.
        output_wrapper: '(function(){%output%}).call(window);',
        warning_level: 'VERBOSE'
      }
    }))
    .pipe(gulp.dest('dist'));
});
```

### Compiling with Google Closure Library

The current version of the compiler doesn't need a deps file as it used to. Now you need to supply the directories where your dependencies are defined (via goog.provide).

```js
var gulp = require('gulp');
var closureCompiler = require('gulp-ploverator');

gulp.task('default', function() {
  return gulp.src(['main.js', 'src/**/*.js', 'bower_components/closure-library/closure/goog/**/*.js'])
    .pipe(closureCompiler({
      compilerPath: 'bower_components/closure-compiler/compiler.jar',
      fileName: 'build.js',
      compilerFlags: {
        closure_entry_point: 'app.main',
        compilation_level: 'ADVANCED_OPTIMIZATIONS',
        only_closure_dependencies: true,
        warning_level: 'VERBOSE'
      }
    }))
    .pipe(gulp.dest('dist'));
});
```


## API

### closureCompiler(options)

#### options

##### fileName

Type: `String`  
Required

Generated file name.

##### compilerPath

Type: `String`  
Required

Path to compiler.jar

##### compilerFlags

Type: `Object`  

Closure compiler [flags](https://github.com/jmcmichael/gulp-plovrator/blob/master/flags.txt).

##### tieredCompilation

Type: `Boolean`  

Tiered compilation enhances the speed of compilation. It's supported everywhere since Java 1.7+, but requires the installation of a JDK.

##### maxBuffer

Type: `Number` 

If the buffer returned by closure compiler is more than 1000kb, you will get an error saying "maxBuffer exceeded". To prevent this, you can set the maxBuffer to the preffered size you want (in kb).

##### continueWithWarnings

Type: `boolean` 

Ignore the warnings and continue with the compiler.  This adds flexiblity to some projects that can't work around certain warnings.  Default value is false.

## Implementation notes

- Closure compiler supports pipes, but not correctly [(issue)](https://code.google.com/p/closure-compiler/issues/detail?id=1292).
- You don't need closurebuilder.py script, compiler knows how to resolve dependencies.
- Java 1.7+ is required.

## License

MIT © [Daniel Steigerwald](https://github.com/steida),

MIT © [Joshua McMichael](https://github.com/jmcmichael)

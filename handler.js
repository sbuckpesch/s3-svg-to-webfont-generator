'use strict';

const async             = require('async');
const AWS               = require('aws-sdk');
const webfontsGenerator = require('webfonts-generator');
const fs                = require('fs');
const util              = require('util');
const path              = require('path');

// get reference to S3 client
const s3 = new AWS.S3();

module.exports.generateWebfont = (event, context, callback) => {

  // Read options from the event.
  console.log("Reading options from event:\n", util.inspect(event, {depth: 5}));
  // Object key may have spaces or unicode non-ASCII characters.
  var srcKey = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, " "));

  // Infer the image type.
  var typeMatch = srcKey.match(/\.([^.]*)$/);
  if (!typeMatch) {
	console.error('unable to infer image type for key ' + srcKey);
	return;
  }
  var imageType = typeMatch[1];
  if (imageType !== "svg") {
	console.log('skipping non-svg ' + srcKey);
	return;
  }

  // Prepare webfont settings
  let dir              = path.dirname(srcKey);
  let name             = dir.split(path.sep).slice(-1).pop();
  const webfontOptions = {
	filename: srcKey,
	bucket  : event.Records[0].s3.bucket.name,
	output  : '/tmp/',
	source  : '/tmp/',
	name    : name,
	path    : name
  };
  console.log("Generating webfont:\n", util.inspect(webfontOptions, {depth: 5}));

  // Validate webfont options
  if (!webfontOptions.name) {
	console.log('No folder name specified ' + srcKey);
	return;
  }

  // Download all SVGs from S3, generate webfont files, and upload to S3 bucket.
  async.waterfall([
		/**
		 * Download all SVG files of that folder
		 * @param next
		 */
		function download(next) {
		  let payload   = {};
		  payload.files = [];

		  // Read all files of the S3 folder the file has been uploaded to
		  s3.listObjects({
			Bucket: webfontOptions.bucket,
			Prefix: dir,
		  }, function (err, data) {

			// GET objects in parallel
			async.each(data.Contents, function (file, callback) {
			  // Prepare file information for writing
			  let fileName = path.basename(file.Key);
			  let fileExt  = path.extname(file.Key);
			  if (fileExt !== '.svg') {
				console.log(`Not an SVG file ${file.Key}`);
				callback();
				return;
			  }

			  // Download each item to the local tmp folder
			  console.log(`Downloading ${file.Key}`);
			  s3.getObject({
				Bucket: webfontOptions.bucket,
				Key   : file.Key
			  }, function (err, data) {
				if (err) {
				  console.error(err.code, "-", err.message);
				  callback();
				  return;
				}

				// Write file to disk
				fs.writeFile(`/tmp/${fileName}`, data.Body, function (err) {
				  if (err) {
					console.log(err.code, "-", err.message);
				  }

				  payload.files.push(`/tmp/${fileName}`);
				  callback();
				});

			  });

			}, function (err) {
			  if (err) {
				console.log(err);
				return;
			  }

			  // All files are available in /tmp/ folder now
			  console.log(
				  `${payload.files.length} SVG files downloaded from '${webfontOptions.bucket}/${dir}/' to '/tmp/'\n`);
			  next(null, payload);

			});
		  });
		},
		/**
		 * Generate webfont
		 * @param payload
		 * @param next
		 */
		function generateFont(payload, next) {
		  // @see https://www.npmjs.com/package/webfonts-generator
		  let config = {
			baseTag           : 'i',
			baseSelector      : '.icon',
			classPrefix       : 'icon-',
			//cssDest    : '/tmp/',
			//cssFontsUrl     : options.fontsPath,
			//cssTemplate: 'templates/css.hbs',
			//types      : ['eot', 'woff2', 'woff', 'ttf', 'svg']
			centerHorizontally: true,
			css               : true,
			decent            : 150,
			dest              : '/tmp/',
			files             : payload.files,
			fixedWidth        : true, // Creates a monospace font of the width of the largest input icon.
			fontHeight        : 1000,
			fontName          : webfontOptions.name,
			html              : true,
			//htmlDest          : '/tmp/',
			htmlTemplate      : 'templates/html.hbs',
			json              : true,
			normalize         : true,
			round             : 10e12,
			templateOptions   : {
			  bucket: `https://${webfontOptions.bucket}.s3.amazonaws.com/${webfontOptions.name}/`
			},
		  };
		  console.log("\nStart generating webfont:\n", util.inspect(config, {depth: 5}));
		  webfontsGenerator(config, function (error, result) {
			if (error) {
			  console.log('An error occured, while generating the webfont.', error);
			  next(error);
			} else {
			  console.log('\nSuccessfully generated webfont files.\n');
			  fs.readdirSync('/tmp/').forEach(file => {
				let fileExt = path.extname(file);
				if (['.eot', '.woff2', '.woff', '.ttf', '.css', '.html', '.scss', '.json'].indexOf(
					fileExt) > -1) {
				  console.log(`/tmp/${file}`);
				}
			  });

			  // If specified, generate JSON icons map by parsing the generated CSS
			  if (config.json) {
				const jsonPath = `/tmp/${config.fontName}.json`;
				console.log(`\nGenerate JSON map ${jsonPath}.\n`);
				let map = {};
				const css = result.generateCss();
				const CSS_PARSE_REGEX = /\-(.*)\:before.*\n\s*content: "(.*)"/gm;
				css.replace(CSS_PARSE_REGEX, (match, name, code) => {
				  map[name] = code
				});

				fs.writeFile(jsonPath, JSON.stringify(map, null, 4), next);
			  } else {
				next();
			  }
			}
		  });
		},
		/**
		 * Upload webfont to S3
		 * @param next
		 */
		function upload(next) {
		  let payload   = {};
		  payload.files = [];

		  // Stream the transformed image to a different S3 bucket.
		  console.log('Start uploading font files');

		  // Get all files from /tmp/ folder and upload them to S3 if it is a webfont file
		  const files = fs.readdirSync('/tmp/');
		  async.each(files, function (file, callback) {
			let fileExt = path.extname(file);

			if (['.eot', '.woff2', '.woff', '.ttf', '.css', '.html', '.scss', '.json'].indexOf(
				fileExt) > -1) {
			  fs.readFile(`/tmp/${file}`, function (err, data) {
				console.log(`Start uploading ${file}`);
				if (err) {
				  console.log(`An error occured while reading ${file}`);
				  callback();
				  return;
				}

				// Buffer Pattern; how to handle buffers; straw, intake/outtake analogy
				var base64data = new Buffer(data, 'binary');
				s3.putObject({
				  Bucket: webfontOptions.bucket,
				  Key   : `${dir}/${file}`,
				  Body  : base64data
				}, function (err, data) {
				  if (err) {
					console.error(err.code, "-", err.message);
					callback();
					return;
				  }

				  console.log(data);
				  payload.files.push(`s3://${webfontOptions.bucket}/${dir}/${file}`);
				  console.log(`File uploaded to s3://${webfontOptions.bucket}/${dir}/${file}`);
				  callback();
				});
			  })

			} else {
			  if (fileExt !== '.svg') {
				console.log(`Skip ${file}, it's not a webfont file.`);
			  }
			  callback();
			}
		  }, function (err) {
			if (err) {
			  console.log(err);
			  return;
			}

			// All tasks are done now
			console.log(
				`${payload.files.length} webfont files uploaded to '${webfontOptions.bucket}/${dir}/\n`);


			// Cleanup
			console.log('Delete all files in /tmp/ folder.');
			const directory = '/tmp/';

			fs.readdir(directory, (err, files) => {
			  if (err) throw err;

			  for (const file of files) {
				fs.unlink(path.join(directory, file), err => {
				  if (err) throw err;
				});
			  }

			  next(null, payload);
			});


		  });
		},
		/**
		 * Cleanup Lambda environment
		 * @param next
		 */
		function cleanup(next) {



		}
	  ],

	  function (err) {
		if (err) {
		  console.error('An error occured while generating the webfont');
		  context.done(err, 'An error occured');
		  return;
		}

		console.log('Finished generating web font');
		context.done(err, 'Finished generating web font');
	  }
  )
  ;


  const response = {
	statusCode: 200,
	body      : JSON.stringify({
	  message: 'Go Serverless v1.0! Your function executed successfully!',
	  input  : event,
	}),
  };

  callback(null, response);
}
;

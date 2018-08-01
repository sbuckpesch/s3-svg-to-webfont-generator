# S3 SVG upload to Webfont

Do you think generating and hosting webfonts is too complicated? Just
make it easy for everyone. This **AWS Lambda function** will:

- Watch a specified S3 bucket for new SVG files
- Regenerate a new webfont on each SVG upload (ttf, woff, eot, html, css, json)
- Recongizes the folder structure of the S3 bucket to manage multiple webfonts

![Automatical Webfont generation on AWS S3](intro.gif "Automatical Webfont generation on AWS S3")

## Requirements

1. [Serverless framework >1.1.0](https://serverless.com/)

## Getting started

1. Clone this repository
2. Edit the serverless.yml file and enter a new and unique
   `bucket_name`, `region` and `stage`
3. `sls deploy`
4. Create a folder on your s3 bucket and put some SVG files in it
5. Enjoy! :-)

## LICENSE

MIT


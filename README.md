# S3 SVG upload to Webfont

Do you think generating and hosting webfonts is too complicated? Just
make it easy for everyone. This **AWS Lambda function** will:

- Watch a specified S3 bucket for new SVG files
- Regenerate a new webfont on each SVG upload (ttf, woff, eot, html, css, json)
- Recongizes the folder structure of the S3 bucket to manage multiple webfonts

## Getting started

1. Edit the serverless.yml file and enter `bucket-name`, `region`

```

```

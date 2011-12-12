# zipstream

Creates ZIP output streams.

## API

  createZip(outputStream)  

Creates a Zipper object.

  Zipper.addEntry(inputStream, features, callback)
  
Adds an entry to the ZIP stream. Currently the only feature is 

  Zipper.finalize()

Finalizes the ZIP by creating the Central Directory.

## Example

  var zipstream = require('./zipstream');
  var fs = require('fs');

  var out = fs.createWriteStream('out.zip');
  var zip = zipstream.createZip(out);

  zip.addEntry(fs.createReadStream('README.md'), { name: 'README.md' }, function() {
    zip.addEntry(fs.createReadStream('example.js'), { name: 'example.js' }, function() {
      zip.finalize();
    });
  });


  

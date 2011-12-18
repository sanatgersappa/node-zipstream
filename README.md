# zipstream

Creates ZIP output streams. Depends on Node's build-in zlib library for compression.

## API

  createZip(outputStream, options)  

Creates a Zipper object. The options are passed to Zlib.

  Zipper.addEntry(inputStream, features, callback)
  
Adds an entry to the ZIP stream. Currently the only feature is 

  Zipper.finalize()

Finalizes the ZIP by creating the Central Directory.


## Example

  var zipstream = require('./zipstream');
  var fs = require('fs');

  var out = fs.createWriteStream('out.zip', { level: 1});
  var zip = zipstream.createZip(out);

  zip.addEntry(fs.createReadStream('README.md'), { name: 'README.md' }, function() {
    zip.addEntry(fs.createReadStream('example.js'), { name: 'example.js' }, function() {
      zip.finalize();
    });
  });


  

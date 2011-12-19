# zipstream

Creates ZIP output streams. Depends on Node's build-in zlib library for compression.

## API

  createZip(options)  

Creates a Zipper object. The options are passed to Zlib.

  Zipper.addEntry(inputStream, features, callback)
  
Adds an entry to the ZIP stream. Features must contain: name, deflated: true, crc32, uncompressed

  Zipper.finalize()

Finalizes the ZIP by creating the Central Directory.


## Example

  var zipstream = require('./zipstream');
  var fs = require('fs');

  var out = fs.createWriteStream('out.zip');
  var zip = zipstream.createZip({ level: 1 });

  zip.on('data', function(data) { out.write(data); });

  zip.addEntry(fs.createReadStream('README.md'), { name: 'README.md' }, function() {
    zip.addEntry(fs.createReadStream('example.js'), { name: 'example.js' }, function() {
      zip.finalize();
    });
  });


  

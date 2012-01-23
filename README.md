# zipstream

Creates ZIP output streams. Depends on Node's build-in zlib module for compression. 

Beware, this version is still under development. Basic functionality is in place but has not
been tested in production.

Written by Antoine van Wel ([website](http://wellawaretech.com)).

# Install

        npm install zipstream


## API

        createZip(options)  

Creates a ZipStream object. Options are passed to Zlib.

        ZipStream.addEntry(inputStream, features, callback)
  
Adds an entry to the ZIP stream. Features may contain "name" (mandatory).

        ZipStream.finalize()

Finalizes the ZIP. 


## Example

         var zipstream = require('zipstream');
         var fs = require('fs');
        
         var out = fs.createWriteStream('out.zip');
         var zip = zipstream.createZip({ level: 1 });
        
         zip.pipe(out);
        
         zip.addEntry(fs.createReadStream('README.md'), { name: 'README.md' }, function() {
           zip.addEntry(fs.createReadStream('example.js'), { name: 'example.js' }, function() {
             zip.finalize();
           });
         });


  

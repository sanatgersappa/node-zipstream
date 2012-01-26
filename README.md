# zipstream

Creates ZIP output streams.  Depends on Node's build-in zlib module for compression 
available since version 0.6. 

This version could use some proper testing. Give me a bump if you experience problems.

Written by Antoine van Wel ([website](http://wellawaretech.com)).

# Install

        npm install zipstream


## API

        createZip(options)  

Creates a ZipStream object. Options are passed to Zlib.

        ZipStream.addFile(inputStream, options, callback)
  
Adds a file to the ZIP stream. At his moment, options must contain "name".

        ZipStream.finalize()

Finalizes the ZIP. 


## Example

        var zipstream = require('zipstream');
        var fs = require('fs');
       
        var out = fs.createWriteStream('out.zip');
        var zip = zipstream.createZip({ level: 1 });
       
        zip.pipe(out);
       
        zip.addFile(fs.createReadStream('README.md'), { name: 'README.md' }, function() {
          zip.addFile(fs.createReadStream('example.js'), { name: 'example.js' }, function() {
            zip.finalize();
          });
        });


  

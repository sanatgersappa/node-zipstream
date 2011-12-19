
var zlib = require('zlib');
var fs = require('fs');
var assert = require('assert');
var events = require('events');
var util = require('util');

var crc32 = require('./crc32');


//TODO test raw input
//TODO date
//TODO improve errors; close down everything properly


function Zipper(opt) {
  this.current = 0;
  this.files = [];
  this.options = opt;
}

util.inherits(Zipper, events.EventEmitter);

exports.createZip = function(opt) {
  return new Zipper(opt);
}

// converts datetime to DOS format
function convertDate(d) {
  var year = d.getFullYear();

  if (year < 1980) {
    return (1<<21) | (1<<16);
  }
  return ((year-1980) << 25) | ((d.getMonth()+1) << 21) | (d.getDate() << 16) | 
    (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);

}


Zipper.prototype.deflate = function(source, file, callback) {
  var self = this;

  if (file.deflated) {
    if (file.crc32 === undefined || file.uncompressed === undefined) {
      emit('error', 'when supplying deflated data, you must also supply crc32 and uncompressed');
      return;
    }
  }

  // local file header
  file.version = 20;
  file.bitflag = 8;
  file.method = 8;
  file.moddate = convertDate(new Date());
  file.offset = self.current;

  var buf = new Buffer(30+file.name.length);

  buf.writeUInt32LE(0x04034b50, 0);         // local file header signature 
  buf.writeUInt16LE(file.version, 4);       // version needed to extract
  buf.writeUInt16LE(file.bitflag, 6);       // general purpose bit flag 
  buf.writeUInt16LE(file.method, 8);        // compression method  
  buf.writeUInt32LE(file.moddate, 10);      // last mod file date and time

  buf.writeInt32LE(0, 14);                  // crc32
  buf.writeUInt32LE(0, 18);                 // compressed size
  buf.writeUInt32LE(0, 22);                 // uncompressed size

  buf.writeUInt16LE(file.name.length, 26);  // file name length
  buf.writeUInt16LE(0, 28);                 // extra field length
  buf.write(file.name, 30);                 // file name

  self.emit('data', buf);
  self.current += buf.length;

  if (!file.deflated) {
  
    // data
    var defl = zlib.createDeflateRaw(self.options);
    var checksum = crc32.createCRC32();
    var uncompressed = 0;
    var compressed = 0;
    
    defl.on('data', function(chunk) { 
      compressed += chunk.length;
      self.emit('data', chunk);
    });

    defl.on('end', function() {
      file.crc32 = checksum.digest();
      file.compressed = compressed;
      file.uncompressed = uncompressed;

      self.current += compressed;

      // data descriptor
      var buf = new Buffer(16);
      buf.writeUInt32LE(0x08074b50, 0);         // data descriptor record signature
      buf.writeInt32LE(file.crc32, 4);          // crc-32
      buf.writeUInt32LE(file.compressed, 8);    // compressed size
      buf.writeUInt32LE(file.uncompressed, 12); // uncompressed size

      self.emit('data', buf);
      self.current += buf.length;
      self.files.push(file);

      callback();
    });

    source.on('data', function(data) {
      uncompressed += data.length;
      checksum.update(data);
      defl.write(data);
    });

    source.on('end', function() { 
      defl.end(); 
    });
  } else {
    var compressed = 0;

    // data is deflated
    source.on('data', function(data) {
      self.emit('data', data);
      compressed += data.length;
    });

    //TODO DRY cleanup. 
    source.on('end', function() { 
      file.compressed = compressed;

      self.current += compressed;

      // data descriptor
      var buf = new Buffer(16);
      buf.writeUInt32LE(0x08074b50, 0);         // data descriptor record signature
      buf.writeInt32LE(file.crc32, 4);          // crc-32
      buf.writeUInt32LE(file.compressed, 8);    // compressed size
      buf.writeUInt32LE(file.uncompressed, 12); // uncompressed size

      self.emit('data', buf);
      self.current += buf.length;
      self.files.push(file);

      callback();
    });
  }

}





Zipper.prototype.finalize = function() {
  var self = this;
  var cdoffset = self.current;
  var cdsize = 0;

  if (self.files.length === 0) { 
    emit('error', 'no files in zip');
    return;
  }
  
  for (var i=0; i<self.files.length; i++) {
    var file = self.files[i];

    var length = 46 + file.name.length;
    cdsize += length;

    // central directory file header
    var buf = new Buffer(length);
    buf.writeUInt32LE(0x02014b50, 0);         // central file header signature 
    buf.writeUInt16LE(file.version, 4);       // TODO version made by 
    buf.writeUInt16LE(file.version, 6);       // version needed to extract 
    buf.writeUInt16LE(file.bitflag, 8);       // general purpose bit flag   
    buf.writeUInt16LE(file.method, 10);       // compression method
    buf.writeUInt32LE(file.moddate, 12);      // last mod file time and date
    buf.writeInt32LE(file.crc32, 16);         // crc-32 
    buf.writeUInt32LE(file.compressed, 20);   // compressed size  
    buf.writeUInt32LE(file.uncompressed, 24); // uncompressed size  
    buf.writeUInt16LE(file.name.length, 28);  // file name length
    buf.writeUInt16LE(0, 30);                 // extra field length
    buf.writeUInt16LE(0, 32);                 // file comment length
    buf.writeUInt16LE(0, 34);                 // disk number where file starts
    buf.writeUInt16LE(0, 36);                 // internal file attributes
    buf.writeUInt32LE(0, 38);                 // external file attributes
    buf.writeUInt32LE(file.offset, 42);       // relative offset
    buf.write(file.name, 46);                 // file name

    self.emit('data', buf);
  }

  
  // end of central directory record
  var buf = new Buffer(22);
  buf.writeUInt32LE(0x06054b50, 0);     // end of central dir signature
  buf.writeUInt16LE(0, 4);              // number of this disk
  buf.writeUInt16LE(0, 6);              // disk where central directory starts
  buf.writeUInt16LE(self.files.length, 8);   // number of central directory records on this disk
  buf.writeUInt16LE(self.files.length, 10);  // total number of central directory records
  buf.writeUInt32LE(cdsize, 12);        // size of central directory in bytes
  buf.writeUInt32LE(cdoffset, 16);      // offset of start of central directory, relative to start of archive
  buf.writeUInt16LE(0, 20);             // comment length

  self.emit('data', buf);
  self.emit('end');
}


Zipper.prototype.addEntry = function(source, file, callback) {
  this.deflate(source, file, callback);
}



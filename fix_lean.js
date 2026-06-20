const fs = require('fs');
const path = require('path');
const glob = require('glob'); // Not available? We can write a simple recursive function

function walk(dir, done) {
  let results = [];
  fs.readdir(dir, function(err, list) {
    if (err) return done(err);
    let i = 0;
    (function next() {
      let file = list[i++];
      if (!file) return done(null, results);
      file = path.resolve(dir, file);
      fs.stat(file, function(err, stat) {
        if (stat && stat.isDirectory()) {
          walk(file, function(err, res) {
            results = results.concat(res);
            next();
          });
        } else {
          if (file.endsWith('.ts') || file.endsWith('.tsx')) {
            results.push(file);
          }
          next();
        }
      });
    })();
  });
}

walk('./app/api', (err, files) => {
  if (err) throw err;
  let modifiedCount = 0;
  
  files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    let original = content;
    
    // We want to add .lean() to find() and findOne() if they are awaited and don't have .lean()
    // It's safer to just look for lines with 'await ' and 'find(' or 'findOne(' 
    // and if there's no '.lean()' or '.save()' or '.exec()' in that statement block...
    
    // Simple regex to match await Model.find(...) or Model.findOne(...)
    // then optional chained methods like .sort().skip().limit().populate()
    // and if it ends with a semicolon or newline without .lean(), add .lean() before the semicolon
    
    // Using a regex with \s* to match newlines
    // This is hard to do perfectly with regex. Let's use a simpler heuristic.
    
    // Let's replace:
    // await Model.find(query) -> await Model.find(query).lean()
    // But what if it has .populate()?
    // await Model.find(query).populate('x') -> await Model.find(query).populate('x').lean()
  });
});

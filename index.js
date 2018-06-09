#!/usr/bin/env node
const colors                = require('colors');
const Handlerbars           = require('handlebars');
const fs                    = require('fs');
const ArgumentParser        = require('argparse').ArgumentParser;
const path                  = require('path');
const { spawn }             = require('child_process');
const _                     = require('lodash');

function die (str) {
  str = str || "";
  console.log(str.red);
  process.exit();
}

let parser = new ArgumentParser({
  version: '0.0.1',
});

parser.addArgument(['-d', '--deck'], {
  help: 'The path to the file to require() to grab the cards'
});
parser.addArgument(['-c', '--config'], {
  help: 'Path to a JSON file for config',
});
parser.addArgument(['-pf', '--prefix'], {
  help: 'Added to the front of filenames. Helps for grouping them in TTS, which uses one big folder for all mods.',
  defaultValue: ''
});
parser.addArgument(['-cs', '--columns'], {
  help: 'Number of cards per column',
  defaultValue: 10
});

parser.addArgument(['-cw', '--card-width'], {
  defaultValue: 2.5 //units are used in your template's css
});

parser.addArgument(['-ch', '--card-height'], {
  defaultValue: 3.5 //units are used in your template's css
});


parser.addArgument(['--skip-png'], {
  defaultValue: false
});

parser.addArgument(['--template'], {
  defaultValue: false
});


let args = parser.parseArgs();

console.log('typeof(args.template)', typeof(args.template))
console.log('args.template', args.template)

if(!args.deck) {
  die('No deck specified.');
}

let config = args;

if(!args.config && process.env.CONFIG) {
  args.config = process.env.CONFIG;
}

if(args.config) {
  console.log('Reading config from ' + args.config.cyan)
  config = JSON.parse(fs.readFileSync(args.config, 'utf8'));
  Object.keys(config).forEach((key) => {
    if (!args[key]) {
      args[key] = config[key]
    }
  })
}
else {
  console.log('No config file to load')
}

if(!args.template) {
  console.log('Using default template')
  args.template = path.join(__dirname, 'template.html');
}
const templateFile = path.resolve(args.template);
console.log('Template file: ' + templateFile.toString().cyan);
let html = fs.readFileSync(templateFile, 'utf8');

console.log('args.decks_dir, args.deck', args.decks_dir, args.deck);
let deckPath = path.join(args.decks_dir, args.deck);

console.log('Deck path: ' + deckPath.toString().bold);

let cards = require(deckPath);
console.log('cards.length',cards.length);
cards = cards.reduce((list, card) => {
  const count = card.count || 1;

  card.is = {};
  card.is[card.type] = true;

  if(args.variables) {
    if(card.description) {
      const template = Handlerbars.compile(card.description);
      card.description = template(args.variables);
    }
  }

  for(var i = 1; i <= count; i++) {
    list.push(card);
  }
  return list
}, [])

console.log('cards.length',cards.length);

function go () {
  const height = args.card_height;
  const rows = Math.ceil(cards.length / args.columns) + 1; //An extra row is needed for some reason
  const template = Handlerbars.compile(html);
  let scope = {
    cards: cards,
    pageHeight: rows * height,
    pageWidth: args.columns * args.card_width,
    cardHeight: args.card_height,
    cardWidth: args.card_width,
    columns: args.columns,
    rows: rows,
    skipPNG: args.skip_png,
    print: false,
    deck: {is: {}}
  };

  scope.pageEnders = []
  for (var i = 7; i <= 100; i++) {
    if (i % 9 == 0) {
      scope.pageEnders.push(i)
      scope.pageEnders.push(i-1)
      scope.pageEnders.push(i-2)
    }
  }

  scope.pointTokens = []
  for (var i = 1; i <= 30; i++) {
    scope.pointTokens.push(1)
  }

  for (var i = 1; i <= 10; i++) {
    scope.pointTokens.push(3)
  }

  for (var i = 1; i <= 20; i++) {
    scope.pointTokens.push(5)
  }

  scope.config = config
  scope.deck.name = args.deck.split('.')[0]
  scope.deck.is[scope.deck.name] = true;
  scope.loop1 = [1]

  for(var i = 2; i <= 40; i++) {
    scope['loop' + i] = scope['loop' + (i-1)].concat(i)
  }

  if(args.css_file) {
    const css = fs.readFileSync(args.css_file, 'utf8');
    scope.css = css;
  }

  const ttsResult = template(scope);
  scope.print = true;
  const printResult = template(scope);

  let htmlTTSPath = path.join(args.output_html_dir, args.deck + '.html');
  let htmlPrintPath = path.join(args.output_html_dir, args.deck + '_print.html');
  console.log('Num cards: ' + cards.length);
  console.log('HTML TTS Output: ' + htmlTTSPath.toString().cyan);
  console.log('HTML Print Output: ' + htmlPrintPath.toString().cyan);

  fs.writeFileSync(htmlTTSPath, ttsResult, 'utf8');
  fs.writeFileSync(htmlPrintPath, printResult, 'utf8');

  console.log('Template compiled into html'.green);

  if(args.skip_png) {
    console.log('Skipping PDF->PNG creation');
    process.exit();
    return
  }

  let pdfPath = path.resolve(path.join(args.output_pdfs_dir, args.prefix + args.deck + '.pdf'));
  let pngPath = path.resolve(path.join(args.output_pngs_dir, args.prefix + args.deck + '.png'));

  const command = spawn('prince', [htmlTTSPath, '-o',  pdfPath]);
  command.stdout.pipe(process.stdout);
  command.stdout.on('data', (data) => {
    console.log('out:', data.toString())
  })
  command.stderr.on('data', (data) => {
    console.log('err:', data.toString())
  })

  setTimeout(function () {
    pdfPath = pdfPath.split('\\').join('/');
    console.log('PDF location: ', pdfPath.cyan);
    console.log('PNG location', pngPath.cyan);
    const convert = spawn("magick", ["convert", pdfPath, '-append', pngPath]);
    convert.stdout.on('data', (data) => {
      console.log('out:', data.toString())
    })
    convert.stderr.on('data', (data) => {
      console.log('err:', data.toString())
    })
  }, 1000);
}

go();
/*
    File Name: app.js
    Purpose: Scrapping the web.
    Author: Shane Ramiah (shane@wirebytes.com)
*/


// Module dependencies
var fs = require('fs');
var path = require('path');
var xray = require('x-ray');
var mysql = require('mysql');
var async = require("async");
var request = require("request");
var jselect = require("JSONSelect");
var cheerio = require('cheerio');
var winston = require('winston');

// Custom Module dependency
var util = require('./lib/util.js');

// Setting configuration folder
var configDir = path.join(__dirname, 'config');

var args = process.argv.slice(2);

var sourceName = args[0] || '';
var verboseParam = args[1] || '';
var isVerbose = false;

if (sourceName === '')
{
  console.log("Missing parameter source name. Make sure you run it as follows 'node app.js <source name>'")
  process.exit(1);
}

if (verboseParam === '-v')
{
  console.log("Running in verbose mode.");
  isVerbose = true;
}


// Getting config from file
var db = JSON.parse(fs.readFileSync(configDir + '/db.json', 'utf8'));
var sources = JSON.parse(fs.readFileSync(configDir + '/sources/' + sourceName + '.json', 'utf8'));
var scrappers = JSON.parse(fs.readFileSync(configDir + '/scrappers.json', 'utf8'));

var date = new Date()

var timestamp = date.getDate().toString() + '-' + (date.getMonth() + 1 ).toString() + '-' + date.getFullYear().toString() + '-' + date.getHours().toString() + '-' + date.getMinutes().toString() + '-' + date.getSeconds().toString();

var logger = new (winston.Logger)({
  level: 'info',
  transports: [
    new (winston.transports.Console)(),
    new (winston.transports.File)({ filename: sourceName + '-' + timestamp + '.log'  })
  ]
});

// MySQL connection
var connection = mysql.createConnection(db);

var mysql = require('mysql');
var pool = mysql.createPool(db);

// Creating an instance of the scrapper
var parser = xray()
    .timeout(300000);

async.eachSeries(sources, function (source, callback) {
    scrapper = scrappers[source.scrapper];

    var category = source.category;
    var logo = scrapper.logo;
    var brand = scrapper.brand;
    var isMobile = scrapper.isMobile || false;
    var buildImage = scrapper.buildImage || false;
    var totalSelector = scrapper.total;
    var totalPerPage = scrapper.totalPerPage;

    var selectors = {
        list: scrapper.list,
        name: scrapper.name,
        image: scrapper.image,
        price: scrapper.price,
        priceAlt: scrapper.priceAlt || '',
        link: scrapper.link
    };

    if (scrapper.isDynamic) {
        if (scrapper.isJSON) {
            request(source.url.replace('{{page}}', 1), function (err, response, data) {
                if (!err) {
                    var js = JSON.parse(data);
                    var total = jselect.match(totalSelector, js);
                    //var total = js.list.products_total;
                    logger.info("Scraping source url: " + source.url);
                    logger.info("Total products found: " + total + "\n");
                    for (var i = 0; i < total / totalPerPage; i++) {
                        scrapeJson(source.url, (i + 1), scrapper.baseurl, category, logo, brand, selectors);
                    }
                    callback(null);
                }
            });
        } else if (scrapper.isHTML) {
          parser(source.url.replace('{{page}}', 1), totalSelector)( function (err, data) {
              if (!err) {
                  var total = 0;
                  if (scrapper.extractTotal)
                  {
                    total = util.extractTotal(data);
                  }
                  else {
                    total = util.extractNumber(data);
                  }

                  logger.info("Scraping source url: " + source.url);
                  logger.info("Total products found: " + total + "\n");
                  scrapeHTML(source.url, 1, total, totalPerPage, scrapper.baseurl, category, logo, brand, selectors, buildImage, true);
                  callback(null);
              }
              else {
                logger.log('warn', err)
              }
          });
        } else if (scrapper.isHybrid) {
          parser(source.urlPage, totalSelector)( function (err, data) {
              if (!err) {
                  var total = util.extractNumber(data);
                    logger.info("Scraping source url: " + source.url);
                    logger.info("Total products found: " + total + "\n");
                    scrapeHybrid(source.url, 1, scrapper.baseurl, category, logo, brand, selectors);
                    callback(null);
              }
          });
        }

    } else {
        var paginate = scrapper.paginate;
        parser(source.url, scrapper.list, [{
            name: scrapper.name,
            image: scrapper.image,
            price: scrapper.price,
            link: scrapper.link
            }]).paginate(paginate)(function (err, output) {
            if (err) logger.log('warn', err);
            if (typeof output !== 'undefined') {
                logger.info("Scraping source: " + source.url);
                logger.info("Scraping done: " + output.length + " records found");
                insert(output, category, logo, brand, isMobile);
                callback(null)
            } else {
                logger.info("Could not scrape webpage. Webpage might be unvailable, taking too long to respond or no more page available for dyanamic scrapping.");
            }
        })
    }

});

var lastLink = '';

function scrapeHTML(url, page, total, totalPerPage, baseurl, category, logo, brand, selectors, buildImage, last) {

    isMobile = false;
    if (isNaN(total))
    {
      total = 0;
    }
    if (page > Math.ceil(total / totalPerPage) && total != 0)
    {
      last = false;
    }

    if (page < (Math.ceil(total / totalPerPage)) || last){

      var targetUrl = url.replace('{{page}}', page);
      if (selectors.priceAlt == '')
      {
        selectors.priceAlt = selectors.price;
      }
      parser(targetUrl, selectors.list, [{
          name: selectors.name,
          image: selectors.image,
          price: selectors.price,
          priceAlt: selectors.priceAlt,
          link: selectors.link
          }])(function (err, output) {
          if (err) logger.log('warn', err);
          if (typeof output !== 'undefined') {
              logger.info("Scraping: " + targetUrl);
              logger.info("Scraping done: " + output.length + " records found");
              insert(output, category, logo, brand, isMobile, buildImage);

              if (output.length > 0)
              {
                  if (output[0].link == lastLink)
                  {
                      scrapeHTML(url, (page + 1), total, totalPerPage, baseurl, category, logo, brand, selectors, buildImage, false);
                  }
                  else {
                      scrapeHTML(url, (page + 1), total, totalPerPage, baseurl, category, logo, brand, selectors, buildImage, true);
                  }
                  lastLink = output[0].link;
              }
              else {
                  scrapeHTML(url, (page + 1), total, totalPerPage, baseurl, category, logo, brand, selectors, buildImage, false);
              }

          } else {
              logger.info("Could not scrape webpage. Webpage might be unvailable or taking too long to respond. " + url);
          }
        });

    }
    else {
        //callback(null);
    }

}



function scrapeJson(url, page, baseurl, category, logo, brand, selectors) {
    var targetUrl = url.replace('{{page}}', page);
    request(targetUrl, function (err, response, data) {
        logger.info("Scraping: " + targetUrl)
        if (!err) {
            var js = JSON.parse(data);
            var products = jselect.match(selectors.list, js);
            var output = [];

            products[0].forEach(function (product, index) {
                var item = {
                    name: product[selectors.name],
                    image: "http:" + product[selectors.image],
                    price: product[selectors.price],
                    link: baseurl + product[selectors.link]
                };
                output.push(item);
            })
            if (typeof output !== 'undefined') {
                logger.info("Scraping done: " + output.length + " records found");
                insert(output, category, logo, brand);
            } else {
                logger.info("Could not scrape webpage. Webpage might be unvailable or taking too long to respond.");
            }
        }
    })
}


function scrapeHybrid(url, page, baseurl, category, logo, brand, selectors) {
  //for pepperfry only
    var targetUrl = url.replace('{{page}}', page);
    request(targetUrl, function (err, response, data) {
        logger.info("Scraping: " + targetUrl)
        var output = [];
        if (!err) {
            var js = JSON.parse(data);

            var html = js.html;

            $ = cheerio.load(html);

            var products = $('.grid-view');

            products.each(function (index, product) {

                var item = {
                    name: $(product).find(".card-body-title").text(),
                    image: $(product).find(".lazy").attr('data-src'),
                    price: $(product).find(".pf-price > .card-body-price").text(),
                    link: $(product).find(".card-header").find("a").attr('href')
                };
                output.push(item);


            })


            if (typeof output !== 'undefined') {
                logger.info("Scraping done: " + output.length + " records found");
                insert(output, category, logo, brand);
            } else {
                logger.info("Could not scrape webpage. Webpage might be unvailable or taking too long to respond.");
            }
        }
    })
}


function insert(records, category, logo, brand, isMobile, buildImage) {
    var values = [];
    try {
        records.forEach(function (element, index) {
            var link = util.clean(element.link)
            if (isMobile) {
                link = link.replace('m.', 'www.');
            }
            var image = util.clean(element.image);
            if (buildImage && typeof element.image != 'undefined')
            {
              // Apply for Jabong only
              image = JSON.parse(element.image);
              image = image.base_path + "-catalog_s.jpg";
            }
            var price = 0;
            if (typeof element.priceAlt != 'undefined')
            {
              price = util.extractPrice(element.priceAlt);
            }
            else {
              price = util.extractPrice(element.price);
            }

            if(isVerbose)
            {
                logger.info(util.clean(element.name) + ", " + price +  ", " + image + ", " + link);
            }

            if (typeof price !== 'undefined' && element.name !== "" && image !== "" && link !== "")
            {
                values.push([1, logo, util.clean(element.name), '', category, brand, price, image, link, '', '']);
            }
        });
        if (values.length > 0) {
            pool.getConnection(function (err, connection) {
                var sql = "INSERT INTO products (m_id, m_logo, name, description, category, brand, price, image, url, size, color) VALUES ? ON DUPLICATE KEY UPDATE m_id=m_id, m_logo=m_logo, name=name, description=description, category=category, brand=brand, price=price, image=image, size=size, color=color ";
                if (typeof connection != 'undefined') {
                    connection.query(sql, [values], function (err) {
                        if (err) logger.error("Error connecting to database: ", err);
                        connection.release();
                    });
                }
                else {
                  logger.error("Could not connect to database");
                }
            });
            logger.info("Inserting: " + values.length + " Records \n");
        }
        else {
          logger.error("Could not insert records");
        }
    } catch (e) {

    }

}


// Warn if overriding existing method
if(Array.prototype.equals)
    console.warn("Overriding existing Array.prototype.equals. Possible causes: New API defines the method, there's a framework conflict or you've got double inclusions in your code.");
// attach the .equals method to Array's prototype to call it on any array
Array.prototype.equals = function (array) {
    // if the other array is a falsy value, return
    if (!array)
        return false;

    // compare lengths - can save a lot of time
    if (this.length != array.length)
        return false;

    for (var i = 0, l=this.length; i < l; i++) {
        // Check if we have nested arrays
        if (this[i] instanceof Array && array[i] instanceof Array) {
            // recurse into the nested arrays
            if (!this[i].equals(array[i]))
                return false;
        }
        else if (this[i] != array[i]) {
            // Warning - two different object instances will never be equal: {x:20} != {x:20}
            return false;
        }
    }
    return true;
}
// Hide method from for-in loops
Object.defineProperty(Array.prototype, "equals", {enumerable: false});

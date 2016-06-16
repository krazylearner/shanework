function clean(str) {

    if (typeof str !== 'undefined') {
        str = str.replace(/(\r\n|\n|\r)/gm, '');
        return str.trim();
    } else {
        return '';
    }
}

function extractPrice(num) {
    if (typeof num !== 'undefined') {
        var val = clean(num);
        var ret = clean(val.replace(/Rs./g, ''));

        if (ret.indexOf(' ') > -1) {
            ret = ret.split(' ')[1];
        }
        else if (ret.indexOf('₹') > -1){
          ret = ret.split('₹')[1];
        }
        return Number(ret.replace(/[^0-9\.]+/g, ''));
    } else {
        return 0;
    }
}

Array.min = function( array ){
    return Math.min.apply( Math, array );
};

function extractNumber(num)
{
  return Number(num.replace(/[^0-9\.]+/g, ''));
}

function extractTotal(text)
{
  text = clean(text);
  return Number(text.split(' ')[5]);
}


exports.clean = clean;
exports.extractPrice = extractPrice;
exports.extractNumber = extractNumber;
exports.extractTotal = extractTotal;

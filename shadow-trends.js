function n(value){const x=Number(value);return Number.isFinite(x)?x:0;}
function ratio(current,previous){const p=n(previous);return p===0?null:n(current)/p;}

function compareWindows({last7={},last14={},last30={}}={}){
  const metric=(name)=>({
    last_7d:n(last7[name]),
    last_14d:n(last14[name]),
    last_30d:n(last30[name]),
    ratio_7_to_14:ratio(last7[name],last14[name]),
    ratio_14_to_30:ratio(last14[name],last30[name]),
  });
  return {
    spend:metric("spend"),
    clicks:metric("clicks"),
    bookings:metric("bookings"),
  };
}

function detectTrendSignals(comparison={}){
  const signals=[];
  const bookings=comparison.bookings||{};
  const spend=comparison.spend||{};
  if(bookings.ratio_7_to_14!==null&&bookings.ratio_7_to_14<0.7)signals.push({code:"BOOKINGS_7D_WEAK",severity:"high",reason:"7-day bookings are below 70% of the 14-day comparison level."});
  if(spend.ratio_7_to_14!==null&&spend.ratio_7_to_14>1.2&&bookings.ratio_7_to_14!==null&&bookings.ratio_7_to_14<=1)signals.push({code:"SPEND_UP_WITHOUT_BOOKING_GROWTH",severity:"high",reason:"7-day spend increased materially without booking growth."});
  return signals;
}

module.exports={compareWindows,detectTrendSignals};

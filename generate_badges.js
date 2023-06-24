#!/usr/bin/env node

// https://pdfkit.org/docs/getting_started.html
const PDFGenerator = require('pdfkit');
const fs = require('fs');
const cfg = require('./config.js');
const qr = require('qrcode');
const mailchimp = require("@mailchimp/mailchimp_marketing");

mailchimp.setConfig({
    apiKey: cfg.mailchimpApiKey,
    server: cfg.mailchimpApiKey.split("-")[1]
});

doWork();



// Generate the PDF document:
async function doWork() {

    // Create the /qr directory if it doesn't already exist
    if (!fs.existsSync(__dirname+'/qr')) { fs.mkdirSync(__dirname+'/qr'); }

    var pdf = new PDFGenerator(cfg.pageSettings);

    pdf.info=cfg.documentInfo;

    pdf.pipe(fs.createWriteStream('Test.pdf'));
    //pdf.pipe(res) // send back as http response

    var badgeWidth=cfg.pageWidth/cfg.badgeHorizontalCount;
    var badgeHeight=cfg.pageHeight/cfg.badgeVerticalCount;
    var badgeCounter=0;

    var mcList = await mailchimp.lists.getListMembersInfo(cfg.mailchimpAudienceId, { count: 1000, /*status: 'subscribed',*/ offset: 0 });

    var sortedMembers = mcList.members.sort(compare_LNAME_FNAME);

    for (member of sortedMembers) {

        var daysSinceLastChange=(Date.now()-(new Date(member.last_changed)))/(24*3600000);

        var printBadge=false;

        // Regular attendee:
        if (member.status=='subscribed') { printBadge=true; }

        // Grace period for accidental unsubscribe in the last 14 days:
        if (member.status=='unsubscribed' && daysSinceLastChange<14) { printBadge=true; }

        // Either way, if you're not registered, you're not going:
        if (member.merge_fields.CONFERENCE!='Registered') { printBadge=false; }
        if (member.merge_fields.FNAME.substring(0, 7).toLowerCase()=='reserve') { printBadge=true; }



/* Comment this section out if you want all the badges, as opposed
   to just most recently registered ones. */
if (daysSinceLastChange>1) {
    printBadge=false;
}





        if (printBadge) {

            console.log({ EMAIL: member.email_address, status: member.status });

            if (badgeCounter>0 && badgeCounter%(cfg.badgeHorizontalCount*cfg.badgeVerticalCount)==0) {
                pdf.addPage(cfg.pageSettings);
                console.log('');
            }

            var x=badgeWidth*(badgeCounter%cfg.badgeHorizontalCount);
            //var y=(badgeHeight*Math.floor(badgeCounter*0.99/cfg.badgeHorizontalCount))%cfg.pageHeight;
            var y=badgeHeight*Math.floor((badgeCounter%(cfg.badgeHorizontalCount*cfg.badgeVerticalCount))/cfg.badgeHorizontalCount);

            //console.log({ "x": x, "y": y });

            if (member.merge_fields.SCANID) {
                await qr.toFile('./qr/'+member.merge_fields.SCANID+'.png', 'https://'+cfg.siteName+'/'+member.merge_fields.SCANID);

                // Add the QR code:
                pdf.image('./qr/'+member.merge_fields.SCANID+'.png',
                    x+badgeWidth/2-badgeHeight*cfg.qrSizePercent/2,
                    y+badgeHeight*cfg.topPercent-cfg.pageTopMargin,
                    { width: badgeHeight*cfg.qrSizePercent, height: badgeHeight*cfg.qrSizePercent });

            }

            if (member.merge_fields.FNAME.substring(0, 7).toLowerCase()=='reserve') {

            } else {
                // Add the name:
                pdf.text(member.merge_fields.FNAME+' '+member.merge_fields.LNAME, x, y+badgeHeight*(cfg.topPercent+cfg.qrSizePercent*1.1)-cfg.pageTopMargin, {
                    bold: true,
                    align: 'center',
                    width: badgeWidth
                });

                // Add the ORG field:
                pdf.text(member.merge_fields.ORG, {
                    align: 'center',
                    width: badgeWidth
                });
            }

            // Add a frame for debugging:
            //pdf.rect(x, y, badgeWidth, badgeHeight).stroke();

            badgeCounter++;
        }

    }

    pdf.end();

    // Delete all the QR code files.
    fs.readdir('./qr', (err, files) => {
        files.forEach(file => {
            fs.rmSync('./qr/'+file);
        })
    });

}




async function createQr(id) {
    await qr.toFile('./qr/'+id+'.png', 'https://'+cfg.siteName+'/'+id);

}

// https://stackoverflow.com/a/1129270/5471286
function compare_LNAME_FNAME(a, b) {
    if (a.merge_fields.LNAME == b.merge_fields.LNAME) {
        if (a.merge_fields.FNAME < b.merge_fields.FNAME) {
            return -1;
        }

        if (a.merge_fields.FNAME > b.merge_fields.FNAME) {
            return 1;
        }

        return 0;
    }

    if (a.merge_fields.LNAME < b.merge_fields.LNAME) {
      return -1;
    }

    if (a.merge_fields.LNAME > b.merge_fields.LNAME){
      return 1;
    }

    return 0;
}
  
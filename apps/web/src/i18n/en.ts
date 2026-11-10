// The flat message catalogue (UX-014). Keys and texts come from docs/ux/content.md;
// keys marked "web addition" are not in content.md and are reported to the UX owner.
// Placeholders in {braces} are filled by t(); `.one` / `.other` pairs are picked by count.
export const en = {
  // Formatting
  "wait.one": "1 minute",
  "wait.other": "{n} minutes",
  "wait.unknown": "a few minutes", // web addition: 429 without a usable Retry-After

  // Status names
  "status.received": "Received",
  "status.drawing": "Drawing",
  "status.drawn": "Drawn",
  "status.ready_to_ship": "Ready to ship",
  "status.shipped": "Shipped",
  "status.cancelled": "Cancelled",
  "status.received.help": "The customer placed the order. Download the SVG to start drawing.",
  "status.drawing.help": "The SVG was downloaded for the robot arm.",
  "status.drawn.help": "The drawing is finished. Frame and pack it next.",
  "status.ready_to_ship.help": "Framed and packed, waiting for the carrier.",
  "status.shipped.help": "Handed to the carrier. This order doesn't change any more.",
  "status.cancelled.help":
    "The order was cancelled and its frame went back to stock. This order doesn't change any more.",

  // Status actions
  "action.downloadSvg": "Download SVG",
  "action.downloadSvgAgain": "Download SVG again",
  "action.markDrawn": "Mark drawn",
  "action.markReadyToShip": "Mark ready to ship",
  "action.markShipped": "Mark shipped",
  "action.cancelOrder": "Cancel order",
  "action.rowSuffix": "for {orderNumber}",
  // web addition: the {targetAction} values listed in the notes of admin.error.invalidTransition
  "transition.drawing": "moved back to Drawing",
  "transition.drawn": "marked drawn",
  "transition.ready_to_ship": "marked ready to ship",
  "transition.shipped": "marked shipped",
  "transition.cancelled": "cancelled",
  "transition.received": "moved back to Received", // web addition, for completeness

  // Shared customer texts (X1)
  "shop.name": "Fineline",
  "shop.tagline": "Your photo as a pen drawing, framed",
  "shop.skip": "Skip to content",
  "shop.title": "{step} - Fineline",
  "shop.steps.label": "Progress",
  "shop.steps.status": "Step {current} of {total}: {name}",
  "shop.steps.photo": "Photo",
  "shop.steps.preview": "Preview",
  "shop.steps.frame": "Frame",
  "shop.steps.details": "Details",
  "shop.steps.completed": "completed", // web addition: visually hidden suffix of done steps (UX-017)
  "shop.footer.contact": "Questions? Email us at {contactEmail}",
  "shop.footer.privacy":
    "Your photo is turned into a drawing on our own server and is never shared.",
  "shop.startAgain.heading": "Start again?",
  "shop.startAgain.body": "Your drawing and the details you entered will be cleared.",
  "shop.startAgain.confirm": "Start again",
  "shop.startAgain.cancel": "Keep going",
  "shop.back": "Back",
  "form.allRequired": "All fields are required.",
  "form.errorSummary.heading": "There is a problem",
  "form.errorPrefix": "Error:",
  "busy.generic": "Please wait...",

  // C1 Photo
  "c1.title": "Step 1 of 4: Your photo",
  "c1.heading": "Turn your photo into a fineline drawing",
  "c1.headingRetry": "Choose another photo",
  "c1.lead":
    "Choose a photo and see your drawing in a few seconds. We draw it on paper with a pen robot, frame it and send it to you.",
  "c1.tips.heading": "Works best with",
  "c1.tips.light": "good, even light",
  "c1.tips.face": "one or two faces, close up",
  "c1.tips.background": "a plain background",
  "c1.requirements": "JPEG, PNG or HEIC, up to 15 MB, at least 800 pixels on the shortest side.",
  "c1.privacy":
    "We only use your photo to make your drawing. If you don't order, we delete it within 24 hours.",
  "c1.choose": "Choose a photo",
  "c1.tryAgain": "Try again",
  "c1.chooseAnother": "Choose another photo",
  "c1.cancelled": "Stopped. Choose a photo when you're ready.",
  "c1.error.missing": "Choose a photo to make your drawing.",
  "c1.error.unsupportedType": "Use a JPEG, PNG or HEIC photo.",
  "c1.error.tooLarge": "The photo must be at most 15 MB. Choose a smaller photo.",
  "c1.error.tooSmall":
    "The photo's shortest side must be at least 800 pixels. Choose a larger photo.",
  "c1.error.tooManyPixels": "The photo may have at most 50 megapixels. Choose a smaller photo.",
  "c1.error.invalidUpload": "Choose one photo and try again.",
  "c1.error.unreadable":
    "We couldn't open this photo. It may be damaged. Please try another photo.",
  "c1.error.noDrawableContent":
    "We couldn't make a drawing from this photo. Please try another photo. A photo with good light and a clear face works best.",
  "c1.error.conversionUnavailable":
    "We can't make drawings right now. Please try again in a few minutes.",
  "c1.error.rateLimited":
    "You've made a lot of drawings in a short time. Please wait {wait} and try again.",
  "c1.error.network": "We couldn't send your photo. Check your internet connection and try again.",

  // C2 Making your drawing
  "c2.title": "Step 1 of 4: Making your drawing",
  "c2.heading": "Making your drawing",
  "c2.photoAlt": "Your photo",
  "c2.working": "Making your drawing. This usually takes a few seconds.",
  "c2.progressLabel": "Progress of your drawing",
  "c2.cancel": "Cancel",

  // C3 Preview
  "c3.title": "Step 2 of 4: Your drawing",
  "c3.heading": "Your drawing is ready",
  "c3.preview.alt": "Preview of your line drawing, made from your photo",
  "c3.size": "Drawn in black fineliner by our pen robot, sized to fit A4 paper.",
  "c3.whatYouSee": "What you see is exactly what we'll draw.",
  "c3.notQuiteRight":
    "Not quite right? A photo with good light, a clear face and a plain background usually gives a clearer drawing.",
  "c3.continue": "Choose a frame",
  "c3.tryAnother": "Try another photo",
  "c3.expiryNote": "You can order this drawing until {time} on {date}.",
  "c3.expired": "This preview is no longer available. Please upload your photo again.",
  "c3.expired.detail": "Your frame choice and details are kept.",
  "c3.expired.action": "Upload your photo again",

  // C4 Frame
  "c4.title": "Step 3 of 4: Choose a frame",
  "c4.heading": "Choose a frame",
  "c4.legend": "Frame",
  "c4.vatNote": "Prices include VAT.",
  "c4.frameSize": "{widthMm} x {heightMm} mm",
  "c4.option.name": "{frameName}, {size}, {price}",
  "c4.continue": "Continue to your details",
  "c4.back": "Back to your drawing",
  "c4.empty": "All our frames are sold out right now. We're restocking - please come back soon.",
  "c4.error.load": "We couldn't load the frames. Check your internet connection and try again.",
  "c4.error.retry": "Try again",
  "c4.error.required": "Choose a frame to continue.",
  "c4.soldOut":
    "This frame just sold out: {frameName}. Please choose another frame - your details and drawing are kept.",

  // C5 Details
  "c5.title": "Step 4 of 4: Your details",
  "c5.heading": "Your details",
  "c5.summary.heading": "Your order",
  "c5.summary.drawingAlt": "Your drawing",
  "c5.summary.changeFrame": "Change frame",
  "c5.allRequired": "All fields are required.",
  "c5.name.label": "Name",
  "c5.email.label": "Email",
  "c5.email.hint": "We only use it to contact you about this order.",
  "c5.address.legend": "Delivery address",
  "c5.address.hint": "We deliver to the Netherlands and Belgium.",
  "c5.country.label": "Country",
  "c5.country.NL": "Netherlands",
  "c5.country.BE": "Belgium",
  "c5.street.label": "Street",
  "c5.houseNumber.label": "House number",
  "c5.houseNumber.hint": "Including any addition, like 12a",
  "c5.postalCode.label": "Postal code",
  "c5.postalCode.hint.NL": "Like 1234 AB",
  "c5.postalCode.hint.BE": "4 digits, like 1000",
  "c5.postalCode.hint.none": "Choose your country first to see the format.",
  "c5.city.label": "City",
  "c5.terms.label": "I agree that my photo is used only to make my drawing",
  "c5.terms.more": "Read the photo terms",
  "c5.terms.body":
    "We use your photo only to make your drawing. It is processed on our own server and never shared with other services. Only Fineline can see your photo and drawing. We delete your photo 30 days after your order is shipped or cancelled, and keep the drawing so you can order it again. If you don't place an order, we delete your photo and preview within 24 hours. Only upload photos you have the right to use, and ask the people in the photo if they agree.",
  "c5.total": "Total: {price} (including VAT)",
  "c5.withdrawal":
    "This drawing is made just for you, so the 14-day right of withdrawal does not apply.",
  "c5.payment": "You don't pay online. We'll email you how to pay.",
  "c5.submit": "Place order",
  "c5.submitting": "Placing order...",
  "c5.back": "Back to frames",
  "c5.error.name.required": "Enter your name.",
  "c5.error.name.tooLong": "Your name must be 200 characters or fewer.",
  "c5.error.email.required": "Enter your email address.",
  "c5.error.email.invalid": "Enter a valid email address, like name@example.com.",
  "c5.error.country.required": "Choose the Netherlands or Belgium.",
  "c5.error.country.notSupported": "We deliver to the Netherlands and Belgium only.",
  "c5.error.street.required": "Enter your street.",
  "c5.error.houseNumber.required": "Enter your house number.",
  "c5.error.houseNumber.tooLong": "The house number must be 20 characters or fewer.",
  "c5.error.postalCode.required": "Enter your postal code.",
  "c5.error.postalCode.invalidNL": "Enter a Dutch postal code, like 1234 AB.",
  "c5.error.postalCode.invalidBE": "Enter a Belgian postal code of 4 digits, like 1000.",
  "c5.error.city.required": "Enter your city.",
  "c5.error.terms.required":
    "Tick the box to agree to the photo terms. We can only make your drawing with your agreement.",
  "c5.error.field.generic": "Check this field.",
  "c5.error.rateLimited": "Too many tries in a short time. Please wait {wait} and try again.",
  "c5.error.network": "We couldn't reach our shop. Check your internet connection and try again.",

  // C6 Confirmation
  "c6.title": "Order placed - Fineline",
  "c6.heading": "Thank you, your order is placed",
  "c6.orderNumber.label": "Order number",
  "c6.keepNumber":
    "Please write down this order number or take a screenshot. You'll need it if you contact us, and this page isn't kept if you reload it.",
  "c6.delivery.label": "Estimated delivery date",
  "c6.frame.label": "Frame",
  "c6.price.label": "Price",
  "c6.price.value": "{price} (including VAT)", // web addition: value pattern from the c6.price.label note
  "c6.name.label": "Name",
  "c6.address.label": "Delivery address",
  "c6.next.heading": "What happens next",
  "c6.next.draw": "Our pen robot draws your portrait in black fineliner.",
  "c6.next.frame": "We frame and pack it by hand.",
  "c6.next.ship": "We send it to your delivery address.",
  "c6.payment": "We'll email you how to pay.",
  "c6.again": "Make another drawing",

  // X3 Page not found
  "x3.title": "Page not found - Fineline",
  "x3.heading": "Page not found",
  "x3.body": "This page doesn't exist. Check the address, or go back to the start.",
  "x3.toShop": "Go to the shop",
  "x3.toOrders": "Go to orders",

  // Admin shared (X2, X5)
  "admin.name": "Fineline admin",
  "admin.title": "{page} - Fineline admin",
  "admin.nav.label": "Admin",
  "admin.nav.orders": "Orders",
  "admin.nav.frames": "Frames",
  "admin.nav.settings": "Settings",
  "admin.logout": "Log out",
  "admin.loggingOut": "Logging out...",
  "admin.loading": "Loading...",
  "admin.retry": "Try again",
  "admin.error.network": "We couldn't reach the server. Check the connection and try again.",
  "admin.error.server":
    "Something went wrong on the server. Try again; if it keeps happening, check the API logs.",
  "admin.error.csrf": "Something went wrong with this request. Reload the page and try again.",
  "admin.error.notFound": "This item doesn't exist any more.",
  "admin.error.invalidTransition":
    "{orderNumber} is {currentStatus} now, so it can't be {targetAction}. The order has been reloaded.",
  "admin.error.rateLimited": "Too many tries. Please wait {wait} and try again.",
  "x5.markShipped.heading": "Mark {orderNumber} as shipped?",
  "x5.markShipped.body":
    "Only do this after handing it to the carrier. Shipped orders can't change any more.",
  "x5.markShipped.confirm": "Mark shipped",
  "x5.markShipped.cancel": "Not yet",
  "x5.cancel.heading": "Cancel order {orderNumber}?",
  "x5.cancel.body":
    "The frame ({frameName}) goes back to stock. A cancelled order can't be reopened.",
  "x5.cancel.confirm": "Cancel order",
  "x5.cancel.keep": "Keep order",
  "x5.busy": "Saving...",

  // A1 Log in
  "a1.title": "Log in - Fineline admin",
  "a1.heading": "Log in to Fineline admin",
  "a1.username.label": "Username",
  "a1.password.label": "Password",
  "a1.showPassword": "Show password",
  "a1.submit": "Log in",
  "a1.submitting": "Logging in...",
  "a1.error.username.required": "Enter your username.",
  "a1.error.password.required": "Enter your password.",
  "a1.error.invalidCredentials": "Wrong username or password.",
  "a1.error.rateLimited": "Too many login attempts. Please wait {wait} and try again.",
  "a1.loggedOut": "You're logged out.",
  "a1.sessionEnded": "Your session has ended. Log in again to continue.",

  // A2 Orders
  "a2.title": "Orders - Fineline admin",
  "a2.titleFiltered": "{filterName} orders - Fineline admin", // web addition: title with the filter
  "a2.heading": "Orders",
  "a2.filter.label": "Filter orders by status",
  "a2.filter.open": "Open",
  "a2.filter.all": "All",
  "a2.refresh": "Refresh list",
  "a2.caption.one": "{filterName} orders, earliest delivery date first - 1 order",
  "a2.caption.other": "{filterName} orders, earliest delivery date first - {count} orders",
  "a2.col.orderNumber": "Order number",
  "a2.col.status": "Status",
  "a2.col.deliveryDate": "Delivery date",
  "a2.col.orderDate": "Order date",
  "a2.col.customer": "Customer",
  "a2.col.frame": "Frame",
  "a2.col.nextStep": "Next step",
  "a2.loading": "Loading orders...",
  "a2.empty.open": "No open orders. New orders appear here as soon as customers place them.",
  "a2.empty.all": "No orders yet. New orders appear here as soon as customers place them.", // web addition
  "a2.empty.filtered": "No orders with status {status}.",
  "a2.empty.showAll": "Show all orders",
  "a2.error.load": "We couldn't load the orders. Check the connection and try again.",
  "a2.error.download":
    "The SVG for {orderNumber} couldn't be downloaded, so its status hasn't changed. Try again.",
  "a2.downloading": "Downloading...",
  "a2.saving": "Saving...",
  "a2.done.downloaded": "{orderNumber} downloaded. Status: Drawing.",
  "a2.done.downloadedAgain": "{orderNumber} downloaded again. Status unchanged: {status}.", // from the a2.done.downloaded note
  "a2.done.status": "{orderNumber} is now {status}.",

  // A3 Order detail
  "a3.title": "Order {orderNumber} - Fineline admin",
  "a3.titleLoading": "Order - Fineline admin", // web addition: while the order loads
  "a3.back": "All orders",
  "a3.heading": "Order {orderNumber}",
  "a3.headingLoading": "Order", // web addition: loading state heading from screens.md
  "a3.nextStep.heading": "Next step",
  "a3.download.hint": "Downloading starts the drawing: the status changes to Drawing.",
  "a3.downloadAgain.hint": "Downloading again gives the same SVG and doesn't change the status.",
  "a3.final": "Shipped and cancelled orders don't change any more.",
  "a3.delivery.heading": "Delivery date",
  "a3.delivery.change": "Change delivery date",
  "a3.delivery.newLabel": "New delivery date",
  "a3.delivery.hint": "Not before the order date, {orderDate}.",
  "a3.delivery.save": "Save delivery date",
  "a3.delivery.cancel": "Cancel",
  "a3.delivery.closed": "The delivery date of a shipped or cancelled order can't be changed.",
  "a3.date.error.beforeOrderDate":
    "The delivery date can't be before the order date ({orderDate}).",
  "a3.date.error.invalid": "Enter a date, like 20/11/2026.",
  "a3.done.date": "Delivery date changed to {date}.",
  "a3.drawing.heading": "Drawing",
  "a3.drawing.alt": "Drawing for order {orderNumber}",
  "a3.drawing.size": "Size",
  "a3.drawing.strokes": "Strokes",
  "a3.drawing.strokeCount.one": "1 stroke", // web addition: value of a3.drawing.strokes
  "a3.drawing.strokeCount.other": "{count} strokes", // web addition
  "a3.drawing.length": "Total line length",
  "a3.drawing.lengthValue": "{metres} m", // web addition: value of a3.drawing.length
  "a3.drawing.error": "The drawing couldn't be loaded.",
  "a3.photo.heading": "Customer's photo",
  "a3.photo.alt": "Customer's photo for order {orderNumber}",
  "a3.photo.deleted":
    "The customer's photo was deleted 30 days after the order was closed. The drawing is kept.",
  "a3.photo.noPreview": "This photo can't be shown in this browser.",
  "a3.photo.download": "Download photo",
  "a3.customer.heading": "Customer",
  "a3.customer.name": "Name",
  "a3.customer.email": "Email",
  "a3.customer.address": "Delivery address",
  "a3.order.heading": "Order",
  "a3.order.date": "Order date",
  "a3.order.frame": "Frame",
  "a3.order.price": "Price",
  "a3.notFound.heading": "Order not found",
  "a3.notFound.body": "This order doesn't exist. It may have been opened from an old link.",
  "a3.error.load": "We couldn't load this order. Check the connection and try again.",
  "a3.done.downloaded": "{orderNumber} downloaded. Status: Drawing.", // same text as a2.done.downloaded
  "a3.done.status": "{orderNumber} is now {status}.",
  "a3.done.cancelled": "{orderNumber} is cancelled. {frameName} is back in stock.",

  // A4 Frames
  "a4.title": "Frames - Fineline admin",
  "a4.heading": "Frames",
  "a4.add": "Add frame",
  "a4.caption": "All frames, by name",
  "a4.col.photo": "Photo",
  "a4.col.name": "Name",
  "a4.col.size": "Size",
  "a4.col.price": "Price",
  "a4.col.stock": "Stock",
  "a4.soldOutTag": "Sold out - not offered to customers",
  "a4.empty": "No frames yet. Add a frame so customers can order.",
  "a4.error.load": "We couldn't load the frames. Check the connection and try again.",

  // A5 New frame
  "a5.title": "Add a frame - Fineline admin",
  "a5.back": "Frames",
  "a5.heading": "Add a frame",
  "a5.name.label": "Name",
  "a5.name.hint": "Shown to customers, like Oak A4.",
  "a5.width.label": "Inner width (mm)",
  "a5.height.label": "Inner height (mm)",
  "a5.size.hint":
    "The visible inside of the frame, portrait. At least {areaWidth} x {areaHeight} mm so the drawing fits.",
  "a5.price.label": "Price (€, including VAT)",
  "a5.price.hint": "Like 49.95",
  "a5.stock.label": "Starting stock",
  "a5.stock.hint": "How many you have now. Later changes go through stock adjustments.",
  "a5.photo.label": "Photo",
  "a5.photo.hint": "JPEG, PNG or WebP, up to 5 MB. Customers see this photo.",
  "a5.photo.previewAlt": "Photo you chose", // web addition: alt of the local preview thumbnail
  "a5.submit": "Add frame",
  "a5.submitting": "Adding frame...",
  "a5.cancel": "Cancel",
  "a5.done": "{frameName} added. Customers can order it now.",
  "a5.doneNoStock": "{frameName} added. It isn't offered to customers until you add stock.",

  // Frame form errors (A5 and A6)
  "frame.error.name.required": "Enter a name.",
  "frame.error.name.tooLong": "The name must be 100 characters or fewer.",
  "frame.error.width.invalid": "Enter the inner width as a whole number of millimetres.",
  "frame.error.height.invalid": "Enter the inner height as a whole number of millimetres.",
  "frame.error.tooSmall":
    "The frame must be at least {areaWidth} x {areaHeight} mm inside, so the drawing fits.",
  "frame.error.price.invalid": "Enter a price in euros above 0, like 49.95.",
  "frame.error.stock.invalid": "Enter a starting stock of 0 or more, as a whole number.",
  "frame.error.photo.missing": "Choose a photo of the frame.",
  "frame.error.photo.unsupportedType": "Use a JPEG, PNG or WebP photo.",
  "frame.error.photo.tooLarge": "The photo must be at most 5 MB.",

  // A6 Edit frame
  "a6.title": "{frameName} - Fineline admin",
  "a6.titleLoading": "Frame - Fineline admin", // web addition: while the frame loads
  "a6.headingLoading": "Frame", // web addition: loading state heading from screens.md
  "a6.back": "Frames",
  "a6.details.heading": "Details",
  "a6.priceNote": "Price changes apply to new orders only. Existing orders keep their price.",
  "a6.save": "Save changes",
  "a6.saving": "Saving...",
  "a6.noChanges": "Nothing changed.",
  "a6.done.details": "Changes saved.",
  "a6.photo.heading": "Photo",
  "a6.photo.alt": "Current photo of {frameName}",
  "a6.photo.choose": "Choose a new photo",
  "a6.photo.replace": "Replace photo",
  "a6.photo.required": "Choose a photo first.",
  "a6.done.photo": "Photo replaced.",
  "a6.stock.heading": "Stock",
  "a6.stock.current": "In stock: {stock}",
  "a6.stock.soldOut": "In stock: 0 - sold out, not offered to customers",
  "a6.stock.amount.label": "Number of frames",
  "a6.stock.amount.hint": "For example 5 after a delivery, or 1 for a damaged frame.",
  "a6.stock.add": "Add to stock",
  "a6.stock.remove": "Remove from stock",
  "a6.error.amount.invalid": "Enter a whole number from 1 to 10000.",
  "a6.error.stockNegative":
    "Stock can't go below zero. There are {stock} in stock, so you can remove at most {stock}.",
  "a6.done.stock": "Stock is now {stock}.",
  "a6.done.stockOffered": "Stock is now {stock}. {frameName} is offered to customers again.", // from the a6.done.stock note (AC-043)
  "a6.done.stockNotOffered": "Stock is now {stock}. {frameName} is no longer offered to customers.", // from the a6.done.stock note
  "a6.notFound": "Frame not found",
  "a6.error.load": "We couldn't load this frame. Check the connection and try again.",

  // A7 Settings
  "a7.title": "Settings - Fineline admin",
  "a7.heading": "Settings",
  "a7.delivery.heading": "Delivery",
  "a7.leadTime.label": "Standard lead time (working days)",
  "a7.leadTime.hint":
    "Working days are Monday to Friday; public holidays count as working days. The new lead time applies to orders placed from now on. Existing orders keep their delivery date.",
  "a7.save": "Save lead time",
  "a7.saving": "Saving...",
  "a7.done.one": "Lead time saved: 1 working day. It applies to orders placed from now on.",
  "a7.done.other": "Lead time saved: {days} working days. It applies to orders placed from now on.",
  "a7.error.leadTime": "The lead time must be a whole number from 1 to 60.",
  "a7.drawingArea": "Drawing area: {width} x {height} mm (set in the deployment configuration)",
  "a7.error.load": "We couldn't load the settings. Check the connection and try again.",
} as const;

export type MessageKey = keyof typeof en;

let foo,
    bar

// Insert custom javascript as-needed

const orderData = {
  // orderNumber: orderName, 
  // orderKey: orderName,
  // orderDate,
  // paymentDate: orderDate,
  // shippingAmount: shippingPaid,
  // amountPaid,
  // orderStatus,
  // items: itemsArray,
  // customerNotes,
  // internalNotes,
  // gift: true,
  // giftMessage,
  // customerEmail,
  // customerUsername: customerEmail,
  // confirmation: 'none',
  // shipTo: {
  //   state: shippingAddressState,
  //   country: shippingAddressCountry,
  //   street1: shippingAddress1,
  //   name: recipientName,
  //   company: recipientCompany,
  //   postalCode: shippingAddressZipCode,
  //   city: shippingAddressCity,
  //   phone: recipientPhoneNumber
  // },
  // billTo: {
  //   name: buyerName
  // },
  // advancedOptions: {
  //   storeId: 356798
  // }
}

const shipstationCreateOrderApiCallBody = JSON.stringify(orderData)

output = [{
  shipstationCreateOrderApiCallBody,
}]
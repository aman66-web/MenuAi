package com.amanmarwaha.numbite.bridge

import com.google.mlkit.vision.barcode.common.Barcode
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class BarcodeDigitsTest {
    @Test fun productCodesAreEightToFourteenDigits() {
        assertTrue(BarcodeDigits.isProductCode("12345678"))
        assertTrue(BarcodeDigits.isProductCode("5000157024671"))
        assertTrue(BarcodeDigits.isProductCode("12345678901234"))
        assertFalse(BarcodeDigits.isProductCode("1234567"))
        assertFalse(BarcodeDigits.isProductCode("123456789012345"))
        assertFalse(BarcodeDigits.isProductCode("500015702467a"))
        assertFalse(BarcodeDigits.isProductCode("٥٠٠٠١٥٧٠٢٤٦٧١")) // other scripts' digits are not product codes
        assertFalse(BarcodeDigits.isProductCode(""))
    }

    @Test fun upcAIsHandedOverAsEan13LikeTheIphone() {
        assertEquals("0012345678905", BarcodeDigits.forPage("012345678905", Barcode.FORMAT_UPC_A))
    }

    @Test fun otherFormatsAreHandedOverAsRead() {
        assertEquals("5000157024671", BarcodeDigits.forPage("5000157024671", Barcode.FORMAT_EAN_13))
        assertEquals("96385074", BarcodeDigits.forPage("96385074", Barcode.FORMAT_EAN_8))
        assertEquals("01318180", BarcodeDigits.forPage("01318180", Barcode.FORMAT_UPC_E)) // leading zero kept
    }

    @Test fun nothingThatIsNotAProductCode() {
        assertNull(BarcodeDigits.forPage(null, Barcode.FORMAT_EAN_13))
        assertNull(BarcodeDigits.forPage("https://example.com", Barcode.FORMAT_QR_CODE))
        assertNull(BarcodeDigits.forPage("12345", Barcode.FORMAT_EAN_8))
    }
}

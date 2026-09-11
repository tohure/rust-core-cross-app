package dev.tohure.android_rust_test

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class MainActivityTest {
    @get:Rule
    val composeTestRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun transferPantallaShowsResultsAfterTransferring() {
        // Nav to Transfer tab
        composeTestRule.onNodeWithText("Transferencia").performClick()

        // Enter amount 100.00
        composeTestRule.onNodeWithText("Monto").performClick()
        composeTestRule.onNodeWithText("").performTextInput("100.00")

        // Click Transfer button
        composeTestRule.onNodeWithText("Transferir").performClick()

        // Wait for the result to appear (after simulated latency)
        Thread.sleep(500)

        // Verify results are displayed
        composeTestRule.onNodeWithText("Resultado").assertIsDisplayed()
        composeTestRule.onNodeWithText("Comisión ITF").assertIsDisplayed()
    }
}

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

/**
 * Rotar la pantalla no puede perder ni la pestaña ni lo tecleado. Con `remember` se perdían
 * las dos: la app volvía a Aritmética con todo en blanco.
 *
 * El label es `"Número"` y no `"Número de tarjeta"`: manda `CardScreen.kt`, que es lo que
 * `docs/ui-spec.md` norma.
 */
@RunWith(AndroidJUnit4::class)
class RotationTest {
    @get:Rule
    val rule = createAndroidComposeRule<MainActivity>()

    @Test
    fun theActiveTabAndItsStateSurviveARecreation() {
        rule.onNodeWithText("Tarjeta").performClick()
        rule.onNodeWithText("Número").performTextInput("4111111111111111")

        rule.activityRule.scenario.recreate()

        rule.onNodeWithText("4111111111111111").assertIsDisplayed()
    }
}

package dev.tohure.android_rust_test.ui.benchmark

import dev.tohure.android_rust_test.adapter.FakeCoreFinanciero
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class BenchmarkViewModelTest {
    private val testDispatcher = StandardTestDispatcher()

    @Before
    fun setup() {
        Dispatchers.setMain(testDispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun zeroIterationsDoesNotLeaveTheSpinnerHanging() = runTest {
        val vm = BenchmarkViewModel(FakeCoreFinanciero(), testDispatcher)
        vm.iterationsChanged("0")
        vm.run()
        advanceUntilIdle()
        // Con n = 0, `measure` calculaba el índice del percentil como
        // (0 * 0.5).toInt().coerceIn(0, -1) y coerceIn lanza IllegalArgumentException si el
        // mínimo supera al máximo. La corrutina moría después de prender isRunning, así que
        // el síntoma visible era el spinner colgado para siempre. En un aparato, además,
        // la excepción sin capturar en viewModelScope se lleva puesta la app.
        assertFalse(vm.uiState.value.isRunning)
        assertEquals("—", vm.uiState.value.coreP50)
    }

    @Test
    fun theIterationsFieldCapsAtSixDigits() {
        val vm = BenchmarkViewModel(FakeCoreFinanciero(), testDispatcher)
        vm.iterationsChanged("999999")
        assertEquals("999999", vm.uiState.value.iterations)
        vm.iterationsChanged("9999999")
        assertEquals("999999", vm.uiState.value.iterations)
        vm.iterationsChanged("250x")
        assertEquals("999999", vm.uiState.value.iterations)
    }

    @Test
    fun runFillsTheFourPercentilesAndTurnsOffTheSpinner() = runTest {
        val vm = BenchmarkViewModel(FakeCoreFinanciero(), testDispatcher)
        vm.iterationsChanged("50")
        vm.run()
        advanceUntilIdle()
        assertFalse(vm.uiState.value.isRunning)
        assertTrue(vm.uiState.value.coreP50.endsWith("µs"))
        assertTrue(vm.uiState.value.coreP95.endsWith("µs"))
        assertTrue(vm.uiState.value.nativeP50.endsWith("µs"))
        assertTrue(vm.uiState.value.nativeP95.endsWith("µs"))
    }
}

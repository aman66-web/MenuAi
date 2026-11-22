package com.amanmarwaha.numbite.bridge

import android.content.Context
import android.content.pm.PackageManager
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * Asks for one runtime permission at a time (camera, approximate location, notifications) and answers when the person has chosen. Must be made while the activity
 * is being created (Activity Result launchers have to exist before the activity starts). Android shows each system question itself; if the person ticked "don't
 * ask again" it answers "no" at once, and the page falls back to something that needs no permission.
 */
class PermissionBroker(private val activity: ComponentActivity) {
    private val lock = Mutex()
    private var waiting: CompletableDeferred<Boolean>? = null
    private val launcher = activity.registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        waiting?.complete(granted)
        waiting = null
    }

    fun isGranted(permission: String): Boolean = isGranted(activity, permission)

    /** The activity is going away: a question still open is answered "no", so nothing waits for an answer that can never come. */
    fun release() {
        waiting?.complete(false)
        waiting = null
    }

    /** True when the permission is held, asking first if it isn't. */
    suspend fun request(permission: String): Boolean {
        if (isGranted(permission)) return true
        return lock.withLock {
            if (isGranted(permission)) return@withLock true
            val answer = CompletableDeferred<Boolean>()
            waiting = answer
            try {
                launcher.launch(permission)
            } catch (_: Exception) {
                waiting = null
                return@withLock false
            }
            answer.await()
        }
    }

    companion object {
        fun isGranted(context: Context, permission: String): Boolean = ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED
    }
}

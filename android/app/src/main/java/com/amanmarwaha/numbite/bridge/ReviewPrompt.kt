package com.amanmarwaha.numbite.bridge

import android.app.Activity
import android.content.Context
import android.util.Log
import com.google.android.play.core.ktx.launchReview
import com.google.android.play.core.ktx.requestReview
import com.google.android.play.core.review.ReviewManagerFactory
import kotlin.coroutines.cancellation.CancellationException

/** Google Play's "rate this app" pop-up, the Android twin of Apple's requestReview (the `review.request` action). */
interface ReviewRequesting {
    /**
     * Asks Google to show its pop-up. Google decides whether it actually appears (it has a quota and never says), so the flow finishing is the answer. False when
     * Google Play can't be reached or has no pop-up to give (no Play Store, no Activity in front).
     */
    suspend fun requestReview(): Boolean
}

/** The page asks only after someone rated the app 5 (web/app/app/_components/RatingPrompt.tsx), at most rarely: the founder's accepted risk under guideline 5.6.1 applies to the iPhone; on Google Play the in-app review API is Google's own. */
class PlayReviewPrompt(private val context: Context, private val activityProvider: () -> Activity?) : ReviewRequesting {
    override suspend fun requestReview(): Boolean {
        val activity = activityProvider() ?: return false
        return try {
            val manager = ReviewManagerFactory.create(context)
            val info = manager.requestReview()
            manager.launchReview(activity, info)
            true
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) { // no Play Store on this phone, Play not reachable, or a ReviewException
            Log.w(TAG, "The review pop-up isn't available", e)
            false
        }
    }

    private companion object { const val TAG = "NumbiteReview" }
}
